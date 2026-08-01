import { App, Notice, TFile } from 'obsidian';
import {
	EditableTaskStatus,
	TaskFieldToken,
	TaskPatch,
	TaskPriority,
	TaskSettings,
	TGTask,
	WriteResult,
} from '../types/task';
import { TaskIndex } from './taskIndex';
import { getTodayKey } from './taskParser';
import { countMixedWords, WritingStatsTracker } from './writingStats';

interface ContentEditResult {
	content: string;
	result: WriteResult;
}

interface TextEdit {
	start: number;
	end: number;
	replacement: string;
}

export class TaskWriter {
	private app: App;
	private index: TaskIndex;
	private getSettings: () => TaskSettings;
	private writingStats: WritingStatsTracker;

	constructor(
		app: App,
		index: TaskIndex,
		getSettings: () => TaskSettings,
		writingStats: WritingStatsTracker
	) {
		this.app = app;
		this.index = index;
		this.getSettings = getSettings;
		this.writingStats = writingStats;
	}

	toggleDone(task: TGTask): Promise<WriteResult> {
		const next: EditableTaskStatus = task.status === 'done' || task.status === 'cancelled' ? 'todo' : 'done';
		return this.setStatus(task, next);
	}

	async setStatus(task: TGTask, status: EditableTaskStatus): Promise<WriteResult> {
		const blocked = getTaskWriteBlockReason(task);
		if (blocked) return this.fail(task, { ok: false, reason: 'read-only-task', message: blocked });
		const newRaw = serializeStatusChange(task, status, this.getSettings(), getTodayKey());
		return this.applyEdit(task, newRaw);
	}

	async updateTask(task: TGTask, patch: TaskPatch): Promise<WriteResult> {
		const blocked = getTaskWriteBlockReason(task);
		if (blocked) return this.fail(task, { ok: false, reason: 'read-only-task', message: blocked });
		const newRaw = serializeTaskPatch(task, patch, this.getSettings());
		if (newRaw === task.raw) return { ok: true };
		return this.applyEdit(task, newRaw);
	}

	async postponeTask(task: TGTask, days: number): Promise<WriteResult> {
		const blocked = getTaskWriteBlockReason(task);
		if (blocked) return this.fail(task, { ok: false, reason: 'read-only-task', message: blocked });
		if (!task.due) {
			return this.fail(task, { ok: false, reason: 'read-only-task', message: '没有到期日，无法顺延' });
		}
		return this.applyEdit(task, serializeTaskPatch(task, { due: shiftDateKey(task.due, days) }, this.getSettings()));
	}

	async deleteTask(task: TGTask): Promise<WriteResult> {
		const blocked = getTaskWriteBlockReason(task);
		if (blocked) return this.fail(task, { ok: false, reason: 'read-only-task', message: blocked });
		return this.applyEdit(task, null);
	}

	private async applyEdit(task: TGTask, newRaw: string | null): Promise<WriteResult> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			return this.fail(task, {
				ok: false,
				reason: 'file-missing',
				message: `文件不存在：${task.filePath}`,
			});
		}

		let writeResult: WriteResult = { ok: true };
		let suppressedDelta = 0;
		try {
			await this.app.vault.process(file, (content) => {
				const edit = applyTaskEditToContent(content, task, newRaw);
				writeResult = edit.result;
				if (!edit.result.ok) return content;
				suppressedDelta = countMixedWords(edit.content) - countMixedWords(content);
				this.writingStats.addTaskWriteSuppression(file.path, suppressedDelta);
				return edit.content;
			});
		} catch (error) {
			if (suppressedDelta !== 0) this.writingStats.addTaskWriteSuppression(file.path, -suppressedDelta);
			writeResult = { ok: false, reason: 'io-error', message: String(error) };
		}

		if (!writeResult.ok) return this.fail(task, writeResult, file);
		await this.index.reindexFile(file);
		return writeResult;
	}

	private async fail(task: TGTask, result: Extract<WriteResult, { ok: false }>, file?: TFile): Promise<WriteResult> {
		const message = `${result.message}。已自动刷新，请重试`;
		const fragment = document.createDocumentFragment();
		fragment.append(message);
		if (result.reason === 'line-mismatch-ambiguous') {
			fragment.append('。请在源文件中把重复的任务改得不同。');
			const button = fragment.createEl('button', { text: '打开源文件', cls: 'tg-task-notice-button' });
			button.addEventListener('click', () => void openTaskSource(this.app, task));
		}
		new Notice(fragment, 8000);
		const target = file ?? this.app.vault.getAbstractFileByPath(task.filePath);
		if (target instanceof TFile) await this.index.reindexFile(target);
		return result;
	}
}

export function getTaskWriteBlockReason(task: TGTask): string | null {
	const diagnostic = task.diagnostics.find((item) => item.blocking);
	if (diagnostic) return diagnostic.message;
	if (task.hasRecurrence) return '循环任务请在源文件或 Tasks 插件中处理';
	if (!task.layout) return '无法可靠定位这条任务，请在源文件中处理';
	return null;
}

export function serializeStatusChange(
	task: TGTask,
	status: EditableTaskStatus,
	settings: TaskSettings,
	today: string
): string {
	if (!task.layout) return task.raw;
	const edits: TextEdit[] = [{ start: task.layout.statusIndex, end: task.layout.statusIndex + 1, replacement: statusChar(status) }];
	const doneTokens = task.layout.fields.filter((field) => field.kind === 'doneDate');
	const cancelledTokens = task.layout.fields.filter((field) => field.kind === 'cancelledDate');

	if (status === 'done') {
		for (const token of cancelledTokens) edits.push(removeTokenEdit(task.raw, token));
		if (settings.recordTerminalDate) upsertDateField(edits, task.raw, doneTokens[0], '✅', today);
		else for (const token of doneTokens) edits.push(removeTokenEdit(task.raw, token));
	} else if (status === 'cancelled') {
		for (const token of doneTokens) edits.push(removeTokenEdit(task.raw, token));
		if (settings.recordTerminalDate) upsertDateField(edits, task.raw, cancelledTokens[0], '❌', today);
		else for (const token of cancelledTokens) edits.push(removeTokenEdit(task.raw, token));
	} else {
		for (const token of [...doneTokens, ...cancelledTokens]) edits.push(removeTokenEdit(task.raw, token));
	}

	return normalizeKnownMarkerSpacing(applyTextEdits(task.raw, edits)).replace(/[ \t]+$/, '');
}

export function serializeTaskPatch(task: TGTask, patch: TaskPatch, settings: TaskSettings): string {
	if (!task.layout) return task.raw;
	const edits: TextEdit[] = [];
	let description = (patch.description ?? task.description).trim();
	const goalTag = settings.goalTag.trim();
	const goalPattern = exactTagPattern(goalTag);
	const suffixGoalEdits: TextEdit[] = [];

	if (patch.goal === false) {
		description = normalizeDescriptionWhitespace(description.replace(goalPattern, ' '));
		const suffix = task.raw.slice(task.layout.descriptionEnd);
		for (const match of suffix.matchAll(exactTagPattern(goalTag))) {
			if (match.index === undefined) continue;
			const tagOffset = match[1]?.length ?? 0;
			const start = task.layout.descriptionEnd + match.index + tagOffset;
			suffixGoalEdits.push(removeInlineTokenEdit(task.raw, start, start + goalTag.length));
		}
	} else if (patch.goal === true && !hasExactTag(`${description} ${task.raw.slice(task.layout.descriptionEnd)}`, goalTag)) {
		description = `${description}${description ? ' ' : ''}${goalTag}`;
	}

	if (patch.description !== undefined || patch.goal !== undefined) {
		const replacement = task.layout.metadataStart === undefined ? description : `${description}${description ? ' ' : ''}`;
		edits.push({ start: task.layout.descriptionStart, end: task.layout.descriptionEnd, replacement });
		edits.push(...suffixGoalEdits);
	}

	if (patch.due !== undefined) {
		const dueToken = task.layout.fields.find((field) => field.kind === 'due');
		patchKnownField(edits, task.raw, dueToken, patch.due ? `📅 ${patch.due}` : null);
	}

	if (patch.priority !== undefined) {
		const priorityToken = task.layout.fields.find((field) => field.kind === 'priority');
		patchKnownField(edits, task.raw, priorityToken, patch.priority ? priorityMarker(patch.priority) : null);
	}

	return normalizeKnownMarkerSpacing(applyTextEdits(task.raw, edits)).replace(/[ \t]+$/, '');
}

export function applyTaskEditToContent(content: string, task: TGTask, newRaw: string | null): ContentEditResult {
	const lines = splitPreservingLineEndings(content);
	const target = task.raw.trim();
	const hits: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (lines[index].text.trim() === target) hits.push(index);
	}
	if (hits.length === 0) {
		return {
			content,
			result: {
				ok: false,
				reason: 'line-mismatch-not-found',
				message: `在 ${task.filePath} 中找不到这一行，可能已被修改`,
			},
		};
	}
	if (hits.length > 1) {
		return {
			content,
			result: {
				ok: false,
				reason: 'line-mismatch-ambiguous',
				message: `在 ${task.filePath} 中发现 ${hits.length} 行完全相同的任务，无法判断改哪一条`,
			},
		};
	}

	const targetIndex = hits[0];
	if (newRaw === null) deleteLine(lines, targetIndex);
	else lines[targetIndex].text = newRaw;
	return { content: lines.map((line) => line.text + line.ending).join(''), result: { ok: true } };
}

export function shiftDateKey(value: string, days: number): string {
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + days);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function statusChar(status: EditableTaskStatus): string {
	return ({ todo: ' ', 'in-progress': '/', done: 'x', cancelled: '-' })[status];
}

function upsertDateField(edits: TextEdit[], raw: string, token: TaskFieldToken | undefined, marker: string, today: string): void {
	if (token) {
		edits.push({ start: token.start, end: token.end, replacement: `${marker} ${today}` });
	} else {
		edits.push({ start: raw.length, end: raw.length, replacement: ` ${marker} ${today}` });
	}
}

function removeTokenEdit(raw: string, token: TaskFieldToken): TextEdit {
	let start = token.start;
	while (start > 0 && (raw[start - 1] === ' ' || raw[start - 1] === '\t')) start--;
	return { start, end: token.end, replacement: '' };
}

function patchKnownField(edits: TextEdit[], raw: string, token: TaskFieldToken | undefined, replacement: string | null): void {
	if (token) {
		edits.push(replacement === null
			? removeTokenEdit(raw, token)
			: { start: token.start, end: token.end, replacement });
	} else if (replacement !== null) {
		edits.push({ start: raw.length, end: raw.length, replacement: ` ${replacement}` });
	}
}

function priorityMarker(priority: TaskPriority): string {
	return ({ highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' })[priority];
}

function exactTagPattern(tag: string): RegExp {
	return new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=\\s|$)`, 'giu');
}

function hasExactTag(text: string, tag: string): boolean {
	return exactTagPattern(tag).test(text);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDescriptionWhitespace(value: string): string {
	return value.trim().replace(/[ \t]{2,}/g, ' ');
}

function removeInlineTokenEdit(raw: string, start: number, end: number): TextEdit {
	while (start > 0 && (raw[start - 1] === ' ' || raw[start - 1] === '\t')) start--;
	return { start, end, replacement: '' };
}

function applyTextEdits(raw: string, edits: TextEdit[]): string {
	const unique = new Map<string, TextEdit>();
	for (const edit of edits) unique.set(`${edit.start}:${edit.end}:${edit.replacement}`, edit);
	return [...unique.values()]
		.sort((a, b) => b.start - a.start || b.end - a.end)
		.reduce((value, edit) => value.slice(0, edit.start) + edit.replacement + value.slice(edit.end), raw);
}

function normalizeKnownMarkerSpacing(raw: string): string {
	return raw.replace(/([^ \t])(📅|⏳|🛫|➕|✅|❌|🔺|⏫|🔼|🔽|⏬|🔁|🆔|⛔)/gu, '$1 $2');
}

function splitPreservingLineEndings(content: string): Array<{ text: string; ending: string }> {
	if (content.length === 0) return [{ text: '', ending: '' }];
	const lines: Array<{ text: string; ending: string }> = [];
	let cursor = 0;
	while (cursor < content.length) {
		const nextLf = content.indexOf('\n', cursor);
		const nextCr = content.indexOf('\r', cursor);
		let next = nextLf < 0 ? nextCr : nextCr < 0 ? nextLf : Math.min(nextLf, nextCr);
		if (next < 0) {
			lines.push({ text: content.slice(cursor), ending: '' });
			break;
		}
		const ending = content[next] === '\r' && content[next + 1] === '\n' ? '\r\n' : content[next];
		lines.push({ text: content.slice(cursor, next), ending });
		cursor = next + ending.length;
	}
	return lines;
}

function deleteLine(lines: Array<{ text: string; ending: string }>, index: number): void {
	if (lines.length === 1) {
		lines[0] = { text: '', ending: '' };
		return;
	}
	if (index === lines.length - 1 && lines[index].ending === '') {
		lines[index - 1].ending = '';
	}
	lines.splice(index, 1);
}

async function openTaskSource(app: App, task: TGTask): Promise<void> {
	const file = app.vault.getAbstractFileByPath(task.filePath);
	if (!(file instanceof TFile)) return;
	await app.workspace.getLeaf(false).openFile(file, { eState: { line: task.line } });
}
