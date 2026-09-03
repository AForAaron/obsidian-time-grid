/**
 * Time Grid 收件箱：插件内新建任务的唯一落盘位置。
 *
 * 与任务模块其他写入路径不同，这里是唯一「新增行」而不是「改写已有行」的地方，
 * 因此没有可供定位的原文。改用与每日流程相同的唯一插槽标记来确定插入位置，
 * 并在与文件内已有行撞车时补一个 🆔，让之后所有基于「原文全局唯一」的写入仍然安全。
 */

export const TASK_SLOT_START = '<!-- time-grid-task-slot:start -->';
export const TASK_SLOT_END = '<!-- time-grid-task-slot:end -->';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 6;

export interface NewTaskDraft {
	description: string;
	/** YYYY-MM-DD；留空表示不写 📅。 */
	due?: string;
	/** YYYY-MM-DD，写入 ➕ 创建日期。 */
	created: string;
	/** 仅在撞车时才带上，避免给每条任务都挂一串可见 ID。 */
	id?: string;
}

export interface InboxMutation {
	content: string;
	changed: boolean;
	error?: string;
}

export function serializeNewTaskLine(draft: NewTaskDraft): string {
	const description = normalizeDescription(draft.description);
	const parts = [`- [ ] ${description}`, `➕ ${draft.created}`];
	if (draft.due) parts.push(`📅 ${draft.due}`);
	if (draft.id) parts.push(`🆔 ${draft.id}`);
	return parts.join(' ');
}

export function normalizeDescription(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** 新建收件箱文件时的初始内容。 */
export function createInboxScaffold(title: string, eol = '\n'): string {
	const lines = [
		`# ${title}`,
		'',
		'Time Grid 在下面的插槽之间新建任务。删除或复制插槽会让新建功能停止工作。',
		'',
		TASK_SLOT_START,
		TASK_SLOT_END,
		'',
	];
	return lines.join(eol);
}

/**
 * 定位唯一插槽。0 个或多个插槽一律报错并拒写，
 * 与计时块「多个即拒写」保持一致，不自作主张挑一个。
 */
export function findTaskSlot(content: string): { start: number; end: number } | { error: string } {
	const starts = findAll(content, TASK_SLOT_START);
	const ends = findAll(content, TASK_SLOT_END);
	if (starts.length === 0 || ends.length === 0) return { error: '收件箱缺少 Time Grid 任务插槽' };
	if (starts.length > 1 || ends.length > 1) return { error: '收件箱中存在多个 Time Grid 任务插槽，已拒绝写入' };
	if (ends[0] <= starts[0]) return { error: '收件箱的任务插槽顺序异常，已拒绝写入' };
	return { start: starts[0], end: ends[0] };
}

/** 插槽缺失时在文末补一对；已存在（哪怕异常）则原样返回，由 findTaskSlot 报错。 */
export function ensureTaskSlot(content: string): InboxMutation {
	if (content.includes(TASK_SLOT_START) || content.includes(TASK_SLOT_END)) {
		return { content, changed: false };
	}
	const eol = detectLineEnding(content);
	const separator = content.length === 0 || content.endsWith(eol) ? '' : eol;
	const block = [TASK_SLOT_START, TASK_SLOT_END, ''].join(eol);
	return { content: `${content}${separator}${block}`, changed: true };
}

/** 把任务行插到插槽末尾（END 标记之前），保持按创建顺序追加。 */
export function insertTaskLine(content: string, line: string): InboxMutation {
	const slot = findTaskSlot(content);
	if ('error' in slot) return { content, changed: false, error: slot.error };
	const eol = detectLineEnding(content);
	const before = content.slice(0, slot.end);
	const after = content.slice(slot.end);
	const separator = before.endsWith(eol) ? '' : eol;
	return { content: `${before}${separator}${line}${eol}${after}`, changed: true };
}

/** 与文件内任意一行 trim 后完全相同即算撞车。 */
export function collidesWithExistingLine(content: string, line: string): boolean {
	const target = line.trim();
	if (!target) return false;
	return content.split(/\r?\n/).some((existing) => existing.trim() === target);
}

/** 生成不与文件内已有 🆔 冲突的短 ID。 */
export function generateTaskId(content: string, random: () => number = Math.random): string {
	const used = new Set(collectExistingIds(content));
	for (let attempt = 0; attempt < 1000; attempt++) {
		let id = '';
		for (let index = 0; index < ID_LENGTH; index++) {
			id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length) % ID_ALPHABET.length];
		}
		if (!used.has(id)) return id;
	}
	throw new Error('无法为新任务生成唯一 ID');
}

export function collectExistingIds(content: string): string[] {
	const ids: string[] = [];
	for (const match of content.matchAll(/🆔\s*([^\s]+)/g)) {
		if (match[1]) ids.push(match[1]);
	}
	return ids;
}

/**
 * 组装一条新任务：确保插槽存在，撞车时补 🆔，然后插入。
 * 任何插槽异常都原样返回内容并附带错误，绝不改写文件。
 */
export function appendTaskToInbox(
	content: string,
	draft: NewTaskDraft,
	random: () => number = Math.random
): InboxMutation & { line?: string } {
	const prepared = ensureTaskSlot(content);
	const slot = findTaskSlot(prepared.content);
	if ('error' in slot) return { content, changed: false, error: slot.error };

	let line = serializeNewTaskLine(draft);
	if (collidesWithExistingLine(prepared.content, line)) {
		line = serializeNewTaskLine({ ...draft, id: draft.id ?? generateTaskId(prepared.content, random) });
	}
	const inserted = insertTaskLine(prepared.content, line);
	if (inserted.error) return { content, changed: false, error: inserted.error };
	return { content: inserted.content, changed: true, line };
}

function findAll(content: string, needle: string): number[] {
	const hits: number[] = [];
	let cursor = 0;
	while (cursor <= content.length) {
		const index = content.indexOf(needle, cursor);
		if (index < 0) break;
		hits.push(index);
		cursor = index + needle.length;
	}
	return hits;
}

function detectLineEnding(content: string): string {
	return content.includes('\r\n') ? '\r\n' : '\n';
}
