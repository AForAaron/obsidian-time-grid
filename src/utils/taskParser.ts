import {
	TaskDiagnostic,
	TaskFieldKind,
	TaskFieldToken,
	TaskPriority,
	TaskSection,
	TaskSettings,
	TaskStatusKind,
	TGTask,
} from '../types/task';
import { parseRoutineTaskMarker, ROUTINE_ITEM_INSTANCE_PREFIX } from './routineMarker';

const DATE_FIELDS: Array<{ marker: string; kind: TaskFieldKind; property: keyof TGTask }> = [
	{ marker: '📅', kind: 'due', property: 'due' },
	{ marker: '⏳', kind: 'scheduled', property: 'scheduled' },
	{ marker: '🛫', kind: 'start', property: 'start' },
	{ marker: '➕', kind: 'created', property: 'created' },
	{ marker: '✅', kind: 'doneDate', property: 'doneDate' },
	{ marker: '❌', kind: 'cancelledDate', property: 'cancelledDate' },
];

const PRIORITY_BY_MARKER: Record<string, TaskPriority> = {
	'🔺': 'highest',
	'⏫': 'high',
	'🔼': 'medium',
	'🔽': 'low',
	'⏬': 'lowest',
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
	highest: 5,
	high: 4,
	medium: 3,
	low: 2,
	lowest: 1,
};

const METADATA_MARKERS = [
	...DATE_FIELDS.map((field) => field.marker),
	...Object.keys(PRIORITY_BY_MARKER),
	'🔁',
	'🆔',
	'⛔',
	ROUTINE_ITEM_INSTANCE_PREFIX,
];

const DATE_ONLY_DESCRIPTION = /^\d{4}-\d{2}-\d{2}$/;

export function parseTaskLine(
	raw: string,
	filePath: string,
	line: number,
	today: string,
	goalTag: string
): TGTask {
	const base: TGTask = {
		id: `${filePath}#L${line}`,
		filePath,
		line,
		raw,
		indent: '',
		statusChar: ' ',
		status: 'unknown',
		checked: false,
		description: raw.trim(),
		trailing: [],
		tags: [],
		section: 'unsorted',
		hasRecurrence: false,
		diagnostics: [],
	};

	const match = /^(.*?(?:[-+*]|\d+[.)]))([ \t]+)\[([^\]])\]([ \t]*)(.*)$/.exec(raw);
	if (!match) {
		base.diagnostics.push({
			code: 'unparseable-line',
			message: '无法可靠拆解这条任务，请在源文件中处理',
			blocking: true,
		});
		base.section = classifyTask(base, today, goalTag);
		return base;
	}

	const [, listPrefix, beforeBox, statusChar, afterBox, body] = match;
	const statusIndex = listPrefix.length + beforeBox.length + 1;
	const bodyStart = statusIndex + 2 + afterBox.length;
	const status = getTaskStatusKind(statusChar);
	const diagnostics: TaskDiagnostic[] = [];
	if (status === 'unknown') {
		diagnostics.push({
			code: 'unknown-status',
			message: `未知任务状态：[${statusChar}]，请在源文件中处理`,
			blocking: true,
		});
	}

	const fields = findFieldTokens(raw, bodyStart, diagnostics);
	const metadataStart = fields.length > 0
		? Math.min(...fields.map((field) => field.start))
		: undefined;
	const descriptionEnd = metadataStart ?? raw.length;
	const description = raw.slice(bodyStart, descriptionEnd).trim();
	const task: TGTask = {
		...base,
		indent: raw.slice(0, statusIndex),
		statusChar,
		status,
		checked: status === 'done' || status === 'cancelled',
		description,
		trailing: metadataStart === undefined ? [] : [raw.slice(metadataStart)],
		tags: extractTags(body),
		hasRecurrence: fields.some((field) => field.kind === 'recurrence'),
		routine: parseRoutineTaskMarker(raw)?.meta,
		diagnostics,
		layout: {
			statusIndex,
			bodyStart,
			descriptionStart: bodyStart,
			descriptionEnd,
			metadataStart,
			fields,
		},
	};

	for (const field of DATE_FIELDS) {
		const token = fields.find((candidate) => candidate.kind === field.kind && candidate.value);
		if (token?.value) {
			(task[field.property] as string | undefined) = token.value;
		}
	}
	const priorityToken = fields.find((field) => field.kind === 'priority' && field.value);
	if (priorityToken?.value) {
		task.priority = priorityToken.value as TaskPriority;
	}
	task.section = classifyTask(task, today, goalTag);
	return task;
}

export function getTaskStatusKind(statusChar: string): TaskStatusKind {
	switch (statusChar) {
		case ' ':
			return 'todo';
		case '/':
			return 'in-progress';
		case 'x':
			return 'done';
		case '-':
			return 'cancelled';
		default:
			return 'unknown';
	}
}

export function hasMeaningfulTaskDescription(description: string): boolean {
	const normalized = description.trim();
	return normalized.length > 0 && !DATE_ONLY_DESCRIPTION.test(normalized);
}

export function classifyTask(task: TGTask, today: string, goalTag: string): TaskSection {
	if (task.status === 'done' || task.status === 'cancelled') return 'done';
	if (hasTag(task.tags, goalTag)) return 'goal';
	if (!task.due) return 'unsorted';
	if (task.due < today) return 'overdue';
	if (task.due === today) return 'today';
	return 'future';
}

export function sortTasks(section: TaskSection, tasks: TGTask[]): TGTask[] {
	return [...tasks].sort((a, b) => {
		switch (section) {
			case 'overdue':
			case 'future':
				return compareOptional(a.due, b.due) || comparePathAndLine(a, b);
			case 'today':
				return (priorityRank(b.priority) - priorityRank(a.priority))
					|| compareOptional(a.due, b.due)
					|| comparePathAndLine(a, b);
			case 'unsorted':
				return compareOptional(b.created, a.created) || comparePathAndLine(a, b);
			case 'goal':
				return comparePathAndLine(a, b);
			case 'done':
				return compareOptional(terminalDate(b), terminalDate(a)) || comparePathAndLine(a, b);
		}
	});
}

export function terminalDate(task: TGTask): string | undefined {
	return task.doneDate ?? task.cancelledDate;
}

export function getTodayKey(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isPathExcluded(filePath: string, configured: string): boolean {
	const normalizedFile = normalizeVaultPath(filePath);
	return configured
		.split(',')
		.map((path) => normalizeVaultPath(path))
		.filter(Boolean)
		.some((path) => normalizedFile === path || normalizedFile.startsWith(`${path}/`));
}

export function normalizeTaskSettings(settings: TaskSettings): TaskSettings {
	const goalTag = settings.goalTag.trim();
	return {
		...settings,
		goalTag: goalTag.startsWith('#') && goalTag.length > 1 ? goalTag : '#goal',
		renderLimit: clampInteger(settings.renderLimit, 1, 1000, 50),
	};
}

function findFieldTokens(raw: string, bodyStart: number, diagnostics: TaskDiagnostic[]): TaskFieldToken[] {
	const tokens: TaskFieldToken[] = [];
	for (const field of DATE_FIELDS) {
		let cursor = bodyStart;
		let count = 0;
		while (cursor < raw.length) {
			const index = raw.indexOf(field.marker, cursor);
			if (index < 0) break;
			count++;
			const tail = raw.slice(index + field.marker.length);
			const dateMatch = /^[ \t]*(\d{4}-\d{2}-\d{2})/.exec(tail);
			const rawValue = dateMatch?.[1];
			const end = dateMatch
				? index + field.marker.length + dateMatch[0].length
				: index + field.marker.length;
			tokens.push({
				kind: field.kind,
				start: index,
				end,
				raw: raw.slice(index, end),
				value: rawValue && isValidDateKey(rawValue) ? rawValue : undefined,
			});
			if (!rawValue || !isValidDateKey(rawValue)) {
				diagnostics.push({
					code: 'invalid-date',
					message: `${field.marker} 后的日期无效，请在源文件中修复`,
					blocking: true,
				});
			}
			cursor = Math.max(end, index + field.marker.length);
		}
		if (count > 1) {
			diagnostics.push({
				code: 'duplicate-field',
				message: `发现重复字段 ${field.marker}，请在源文件中修复`,
				blocking: true,
			});
		}
	}

	let priorityCount = 0;
	for (const [marker, priority] of Object.entries(PRIORITY_BY_MARKER)) {
		let cursor = bodyStart;
		while (cursor < raw.length) {
			const index = raw.indexOf(marker, cursor);
			if (index < 0) break;
			priorityCount++;
			tokens.push({ kind: 'priority', start: index, end: index + marker.length, raw: marker, value: priority });
			cursor = index + marker.length;
		}
	}
	if (priorityCount > 1) {
		diagnostics.push({
			code: 'duplicate-field',
			message: '发现多个优先级字段，请在源文件中修复',
			blocking: true,
		});
	}

	for (const marker of ['🔁', '🆔', '⛔']) {
		const kind = marker === '🔁' ? 'recurrence' : marker === '🆔' ? 'id' : 'blocked';
		let cursor = bodyStart;
		while (cursor < raw.length) {
			const index = raw.indexOf(marker, cursor);
			if (index < 0) break;
			const next = findNextMarker(raw, index + marker.length);
			const end = next < 0 ? raw.length : next;
			tokens.push({ kind, start: index, end, raw: raw.slice(index, end) });
			cursor = Math.max(end, index + marker.length);
		}
	}

	const routineMarker = parseRoutineTaskMarker(raw);
	if (routineMarker) {
		tokens.push({
			kind: 'routine',
			start: routineMarker.start,
			end: routineMarker.end,
			raw: raw.slice(routineMarker.start, routineMarker.end),
			value: routineMarker.meta.itemId,
		});
	}

	return tokens.sort((a, b) => a.start - b.start || a.end - b.end);
}

function findNextMarker(raw: string, from: number): number {
	let next = -1;
	for (const marker of METADATA_MARKERS) {
		const index = raw.indexOf(marker, from);
		if (index >= 0 && (next < 0 || index < next)) next = index;
	}
	return next;
}

function extractTags(text: string): string[] {
	const matches = text.match(/(^|\s)(#[\p{L}\p{N}_/-]+)/gu) ?? [];
	return matches.map((match) => match.trim());
}

function hasTag(tags: string[], goalTag: string): boolean {
	const normalized = goalTag.trim().toLocaleLowerCase();
	return normalized.length > 1 && tags.some((tag) => tag.toLocaleLowerCase() === normalized);
}

function isValidDateKey(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year
		&& date.getUTCMonth() === month - 1
		&& date.getUTCDate() === day;
}

function priorityRank(priority: TaskPriority | undefined): number {
	return priority ? PRIORITY_RANK[priority] : 0;
}

function compareOptional(a: string | undefined, b: string | undefined): number {
	if (a === b) return 0;
	if (a === undefined) return 1;
	if (b === undefined) return -1;
	return a.localeCompare(b);
}

function comparePathAndLine(a: TGTask, b: TGTask): number {
	return a.filePath.localeCompare(b.filePath) || a.line - b.line;
}

function normalizeVaultPath(path: string): string {
	return path.trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}
