import { RunningTimerEntry, TimerActionResult } from '../types/timer';

export const TIMER_SLOT_START = '<!-- time-grid-timer-slot:start -->';
export const TIMER_SLOT_END = '<!-- time-grid-timer-slot:end -->';

type TimerEntryObject = Record<string, unknown>;
type TimerDocument = Record<string, unknown> & { entries: TimerEntryObject[] };

interface TrackerBlock {
	bodyStart: number;
	bodyEnd: number;
	body: string;
}

export type TimerContentStatus = 'missing' | 'ready' | 'invalid' | 'multiple';

export interface TimerContentInspection {
	status: TimerContentStatus;
	runningEntries: RunningTimerEntry[];
	document?: TimerDocument;
	block?: TrackerBlock;
	message?: string;
}

export interface TimerContentMutation {
	content: string;
	changed: boolean;
	result: TimerActionResult;
	runningEntries: RunningTimerEntry[];
}

const TRACKER_FENCE = /^```simple-time-tracker[^\S\r\n]*(?:\r?\n)([\s\S]*?)^```[^\S\r\n]*$/gm;

export function inspectTimerContent(content: string): TimerContentInspection {
	const slotError = validateTimerSlot(content);
	if (slotError) return { status: 'invalid', runningEntries: [], message: slotError };
	const blocks = findTrackerBlocks(content);
	if (blocks.length === 0) return { status: 'missing', runningEntries: [] };
	if (blocks.length > 1) {
		return { status: 'multiple', runningEntries: [], message: '今日日记中存在多个 simple-time-tracker 块，已拒绝写入' };
	}
	const block = blocks[0];
	let raw: unknown;
	try {
		raw = block.body.trim() ? JSON.parse(block.body.trim()) : { entries: [] };
	} catch {
		return { status: 'invalid', runningEntries: [], block, message: 'simple-time-tracker JSON 格式有误，已拒绝写入' };
	}
	if (!isObject(raw)) {
		return { status: 'invalid', runningEntries: [], block, message: 'simple-time-tracker 根节点必须是 JSON 对象' };
	}
	if (raw.entries !== undefined && !Array.isArray(raw.entries)) {
		return { status: 'invalid', runningEntries: [], block, message: 'simple-time-tracker entries 必须是数组' };
	}
	const entries = (raw.entries ?? []) as unknown[];
	if (entries.some((entry) => !isObject(entry))) {
		return { status: 'invalid', runningEntries: [], block, message: 'simple-time-tracker 包含无法识别的计时条目' };
	}
	const document = raw as TimerDocument;
	document.entries = entries as TimerEntryObject[];
	return { status: 'ready', document, block, runningEntries: collectRunningEntries(document.entries) };
}

export function startTimerInContent(content: string, name: string, now: Date, resolveAll = false): TimerContentMutation {
	const normalized = name.trim();
	if (!normalized) return failure(content, 'invalid-name', '活动名称不能为空');
	const prepared = ensureTrackerBlock(content);
	if (!prepared.result.ok) return prepared;
	const inspected = inspectTimerContent(prepared.content);
	if (inspected.status !== 'ready' || !inspected.document || !inspected.block) {
		return inspectionFailure(prepared.content, inspected);
	}
	if (inspected.runningEntries.length > 1 && !resolveAll) {
		return conflict(prepared.content, inspected.runningEntries);
	}
	const timestamp = now.toISOString();
	const switchedFrom = inspected.runningEntries.length === 1 ? inspected.runningEntries[0].name : undefined;
	if (inspected.runningEntries.length > 0) closeAllRunning(inspected.document.entries, timestamp);
	inspected.document.entries.push({ name: normalized, startTime: timestamp, endTime: null, subEntries: null });
	const next = replaceTrackerDocument(prepared.content, inspected.block, inspected.document);
	return {
		content: next,
		changed: next !== content,
		result: { ok: true, switchedFrom },
		runningEntries: [{ name: normalized, startTime: timestamp, path: [inspected.document.entries.length - 1] }],
	};
}

export function stopTimerInContent(content: string, now: Date, resolveAll = false): TimerContentMutation {
	const inspected = inspectTimerContent(content);
	if (inspected.status === 'missing') return success(content, false, []);
	if (inspected.status !== 'ready' || !inspected.document || !inspected.block) return inspectionFailure(content, inspected);
	if (inspected.runningEntries.length > 1 && !resolveAll) return conflict(content, inspected.runningEntries);
	if (inspected.runningEntries.length === 0) return success(content, false, []);
	closeAllRunning(inspected.document.entries, now.toISOString());
	const next = replaceTrackerDocument(content, inspected.block, inspected.document);
	return success(next, next !== content, []);
}

export function closeTimerByIdentity(
	content: string,
	name: string,
	startTime: string,
	endTime: Date
): TimerContentMutation {
	const inspected = inspectTimerContent(content);
	if (inspected.status !== 'ready' || !inspected.document || !inspected.block) return inspectionFailure(content, inspected);
	const matches = findEntries(inspected.document.entries, (entry) =>
		entry.name === name && entry.startTime === startTime
	);
	if (matches.length !== 1) return failure(content, 'stale', '找不到唯一的原始运行计时，跨日恢复已停止');
	const entry = matches[0];
	const target = endTime.toISOString();
	if (typeof entry.endTime === 'string' && entry.endTime) {
		if (entry.endTime === target) return success(content, false, inspected.runningEntries);
		return failure(content, 'stale', '原始计时已在其他位置结束，跨日恢复已停止');
	}
	entry.endTime = target;
	const next = replaceTrackerDocument(content, inspected.block, inspected.document);
	return success(next, next !== content, collectRunningEntries(inspected.document.entries));
}

export function upsertTimerSegment(
	content: string,
	name: string,
	startTime: Date,
	endTime: Date | null
): TimerContentMutation {
	const prepared = ensureTrackerBlock(content);
	if (!prepared.result.ok) return prepared;
	const inspected = inspectTimerContent(prepared.content);
	if (inspected.status !== 'ready' || !inspected.document || !inspected.block) return inspectionFailure(prepared.content, inspected);
	const start = startTime.toISOString();
	const end = endTime?.toISOString() ?? null;
	const matches = findEntries(inspected.document.entries, (entry) => entry.name === name && entry.startTime === start);
	if (matches.length > 1) return failure(prepared.content, 'stale', '跨日续段重复，已拒绝继续写入');
	const otherRunning = inspected.runningEntries.filter((entry) => entry.startTime !== start || entry.name !== name);
	if (otherRunning.length > 0) return conflict(prepared.content, otherRunning);
	if (matches.length === 1) {
		const entry = matches[0];
		if (entry.endTime !== end) {
			if (entry.endTime && entry.endTime !== end) return failure(prepared.content, 'stale', '跨日续段已被外部修改');
			entry.endTime = end;
		}
	} else {
		inspected.document.entries.push({ name, startTime: start, endTime: end, subEntries: null });
	}
	const next = replaceTrackerDocument(prepared.content, inspected.block, inspected.document);
	return success(next, next !== content, collectRunningEntries(inspected.document.entries));
}

export function getTimerEntryNames(content: string): Array<{ name: string; startedAt: number }> {
	const inspected = inspectTimerContent(content);
	if (inspected.status !== 'ready' || !inspected.document) return [];
	return findEntries(inspected.document.entries, () => true)
		.map((entry) => ({
			name: typeof entry.name === 'string' ? entry.name.trim() : '',
			startedAt: typeof entry.startTime === 'string' ? Date.parse(entry.startTime) : NaN,
		}))
		.filter((entry) => entry.name && Number.isFinite(entry.startedAt));
}

export function ensureTrackerBlock(content: string): TimerContentMutation {
	const inspected = inspectTimerContent(content);
	if (inspected.status === 'ready') return success(content, false, inspected.runningEntries);
	if (inspected.status !== 'missing') return inspectionFailure(content, inspected);
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const block = `\`\`\`simple-time-tracker${eol}{"entries":[]}${eol}\`\`\``;
	const start = content.indexOf(TIMER_SLOT_START);
	const end = content.indexOf(TIMER_SLOT_END);
	let next: string;
	if (start >= 0 && end > start) {
		const insertion = start + TIMER_SLOT_START.length;
		next = `${content.slice(0, insertion)}${eol}${block}${eol}${content.slice(end)}`;
	} else {
		const separator = content.length === 0 ? '' : content.endsWith(`${eol}${eol}`) ? '' : content.endsWith(eol) ? eol : `${eol}${eol}`;
		next = `${content}${separator}## 时间记录${eol}${eol}${block}${eol}`;
	}
	const ready = inspectTimerContent(next);
	if (ready.status !== 'ready') return inspectionFailure(content, ready);
	return success(next, next !== content, ready.runningEntries);
}

function findTrackerBlocks(content: string): TrackerBlock[] {
	const blocks: TrackerBlock[] = [];
	TRACKER_FENCE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TRACKER_FENCE.exec(content)) !== null) {
		const full = match[0];
		const firstLineEnd = full.indexOf('\n') + 1;
		const closing = full.lastIndexOf('```');
		blocks.push({
			bodyStart: match.index + firstLineEnd,
			bodyEnd: match.index + closing,
			body: full.slice(firstLineEnd, closing),
		});
	}
	return blocks;
}

function validateTimerSlot(content: string): string | null {
	const starts = findAll(content, TIMER_SLOT_START);
	const ends = findAll(content, TIMER_SLOT_END);
	if (starts.length === 0 && ends.length === 0) return null;
	if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) {
		return 'time-grid-timer-slot 标记缺失、重复或顺序错误，已拒绝写入';
	}
	return null;
}

function collectRunningEntries(entries: TimerEntryObject[], parentPath: number[] = []): RunningTimerEntry[] {
	const running: RunningTimerEntry[] = [];
	entries.forEach((entry, index) => {
		const path = [...parentPath, index];
		const subEntries = Array.isArray(entry.subEntries) ? entry.subEntries.filter(isObject) as TimerEntryObject[] : [];
		if (subEntries.length > 0) {
			running.push(...collectRunningEntries(subEntries, path));
			return;
		}
		const startTime = typeof entry.startTime === 'string' ? entry.startTime : '';
		const hasEnd = typeof entry.endTime === 'string' && entry.endTime.length > 0;
		if (startTime && Number.isFinite(Date.parse(startTime)) && !hasEnd) {
			running.push({
				name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : '未命名',
				startTime,
				path,
			});
		}
	});
	return running;
}

function closeAllRunning(entries: TimerEntryObject[], timestamp: string): void {
	for (const entry of entries) {
		const subEntries = Array.isArray(entry.subEntries) ? entry.subEntries.filter(isObject) as TimerEntryObject[] : [];
		if (subEntries.length > 0) closeAllRunning(subEntries, timestamp);
		else if (typeof entry.startTime === 'string' && Number.isFinite(Date.parse(entry.startTime)) && !(typeof entry.endTime === 'string' && entry.endTime)) {
			entry.endTime = timestamp;
		}
	}
}

function findEntries(entries: TimerEntryObject[], predicate: (entry: TimerEntryObject) => boolean): TimerEntryObject[] {
	const result: TimerEntryObject[] = [];
	for (const entry of entries) {
		if (predicate(entry)) result.push(entry);
		const children = Array.isArray(entry.subEntries) ? entry.subEntries.filter(isObject) as TimerEntryObject[] : [];
		result.push(...findEntries(children, predicate));
	}
	return result;
}

function replaceTrackerDocument(content: string, block: TrackerBlock, document: TimerDocument): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	return `${content.slice(0, block.bodyStart)}${JSON.stringify(document)}${eol}${content.slice(block.bodyEnd)}`;
}

function inspectionFailure(content: string, inspected: TimerContentInspection): TimerContentMutation {
	return failure(content, 'invalid-content', inspected.message ?? '计时块格式异常，已拒绝写入', inspected.runningEntries);
}

function conflict(content: string, runningEntries: RunningTimerEntry[]): TimerContentMutation {
	return failure(content, 'conflict', `发现 ${runningEntries.length} 个活动正在运行`, runningEntries);
}

function success(content: string, changed: boolean, runningEntries: RunningTimerEntry[]): TimerContentMutation {
	return { content, changed, runningEntries, result: { ok: true } };
}

function failure(
	content: string,
	reason: 'invalid-name' | 'invalid-content' | 'conflict' | 'stale',
	message: string,
	runningEntries: RunningTimerEntry[] = []
): TimerContentMutation {
	return { content, changed: false, runningEntries, result: { ok: false, reason, message } };
}

function findAll(content: string, needle: string): number[] {
	const hits: number[] = [];
	let from = 0;
	while (from <= content.length) {
		const index = content.indexOf(needle, from);
		if (index < 0) break;
		hits.push(index);
		from = index + needle.length;
	}
	return hits;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
