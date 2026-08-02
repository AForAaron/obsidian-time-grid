import { App, TFile } from 'obsidian';
import {
	RunningTimerEntry,
	TimerActionResult,
	TimerRecoveryPointer,
	TimerSnapshot,
} from '../types/timer';
import { getDailyNoteFilename } from './dailyNotesParser';
import {
	getDailyNoteFileForDate,
	getOrCreateDailyNoteFileForDate,
	isDailyNotesAvailable,
} from './dailyNotes';
import {
	closeTimerByIdentity,
	getTimerEntryNames,
	inspectTimerContent,
	startTimerInContent,
	stopTimerInContent,
	TimerContentMutation,
	upsertTimerSegment,
} from './timerFormat';
import { countMixedWords, WritingStatsTracker } from './writingStats';

type RecoveryMode = 'continue' | 'stop-at-midnight';

export class TimerRepository {
	private app: App;
	private writingStats: WritingStatsTracker;

	constructor(app: App, writingStats: WritingStatsTracker) {
		this.app = app;
		this.writingStats = writingStats;
	}

	async getSnapshot(now = new Date()): Promise<TimerSnapshot> {
		const dateKey = getDailyNoteFilename(now);
		const file = getDailyNoteFileForDate(this.app, now);
		if (!file) {
			return { status: 'idle', preparation: 'no-diary', dateKey, runningEntries: [] };
		}
		const content = await this.app.vault.cachedRead(file);
		return snapshotFromContent(content, dateKey, file.path);
	}

	async start(name: string, now = new Date(), resolveAll = false): Promise<TimerActionResult> {
		if (!name.trim()) return { ok: false, reason: 'invalid-name', message: '活动名称不能为空' };
		if (!isDailyNotesAvailable()) {
			return { ok: false, reason: 'daily-notes-disabled', message: '请先在设置中启用核心插件「日记」' };
		}
		const file = await getOrCreateDailyNoteFileForDate(this.app, now);
		if (!file) return { ok: false, reason: 'file-missing', message: '无法创建今日日记' };
		return this.process(file, (content) => startTimerInContent(content, name, now, resolveAll));
	}

	async stop(now = new Date(), resolveAll = false): Promise<TimerActionResult> {
		const file = getDailyNoteFileForDate(this.app, now);
		if (!file) return { ok: true };
		return this.process(file, (content) => stopTimerInContent(content, now, resolveAll));
	}

	async getRecentNames(now = new Date(), days = 7): Promise<string[]> {
		const names = new Map<string, { name: string; startedAt: number }>();
		for (let offset = 0; offset < days; offset++) {
			const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12, 0, 0, 0);
			const file = getDailyNoteFileForDate(this.app, date);
			if (!file) continue;
			const content = await this.app.vault.cachedRead(file);
			for (const entry of getTimerEntryNames(content)) {
				const key = entry.name.toLocaleLowerCase();
				const previous = names.get(key);
				if (!previous || entry.startedAt > previous.startedAt) names.set(key, entry);
			}
		}
		return [...names.values()].sort((a, b) => b.startedAt - a.startedAt).map((entry) => entry.name);
	}

	async reconcileAcrossMidnight(
		pointer: TimerRecoveryPointer,
		now: Date,
		mode: RecoveryMode
	): Promise<TimerActionResult> {
		const sourceDate = dateFromKey(pointer.sourceDate);
		const sourceFile = getDailyNoteFileForDate(this.app, sourceDate);
		if (!sourceFile) return { ok: false, reason: 'file-missing', message: '找不到计时开始当天的日记' };
		const firstMidnight = nextMidnight(sourceDate);
		const preflight = await this.preflightRecovery(pointer, now, mode);
		if (!preflight.ok) return preflight;
		const closed = await this.process(sourceFile, (content) =>
			closeTimerByIdentity(content, pointer.name, pointer.startTime, firstMidnight)
		);
		if (!closed.ok || mode === 'stop-at-midnight') return closed;

		for (const date of continuationDates(sourceDate, now)) {
			const file = await getOrCreateDailyNoteFileForDate(this.app, date);
			if (!file) return { ok: false, reason: 'file-missing', message: `无法创建日记 ${getDailyNoteFilename(date)}` };
			const isToday = getDailyNoteFilename(date) === getDailyNoteFilename(now);
			const start = startOfDay(date);
			const end = isToday ? null : nextMidnight(date);
			const written = await this.process(file, (content) => upsertTimerSegment(content, pointer.name, start, end));
			if (!written.ok) return written;
		}
		return { ok: true };
	}

	async inspectRecovery(pointer: TimerRecoveryPointer, now: Date): Promise<TimerActionResult> {
		return this.preflightRecovery(pointer, now, 'continue');
	}

	private async preflightRecovery(
		pointer: TimerRecoveryPointer,
		now: Date,
		mode: RecoveryMode
	): Promise<TimerActionResult> {
		if (!isDailyNotesAvailable()) {
			return { ok: false, reason: 'daily-notes-disabled', message: '请先在设置中启用核心插件「日记」' };
		}
		const sourceDate = dateFromKey(pointer.sourceDate);
		const sourceFile = getDailyNoteFileForDate(this.app, sourceDate);
		if (!sourceFile) return { ok: false, reason: 'file-missing', message: '找不到计时开始当天的日记' };
		const source = inspectTimerContent(await this.app.vault.cachedRead(sourceFile));
		const matching = source.runningEntries.filter((entry) => entry.name === pointer.name && entry.startTime === pointer.startTime);
		if (matching.length !== 1) return { ok: false, reason: 'stale', message: '原始运行计时已改变，无法自动跨日恢复' };
		if (mode === 'stop-at-midnight') return { ok: true };
		for (const date of continuationDates(sourceDate, now)) {
			const file = getDailyNoteFileForDate(this.app, date);
			if (!file) continue;
			const inspected = inspectTimerContent(await this.app.vault.cachedRead(file));
			if (inspected.status === 'missing') continue;
			if (inspected.status !== 'ready') {
				return { ok: false, reason: 'invalid-content', message: inspected.message ?? `${getDailyNoteFilename(date)} 计时块异常` };
			}
			const expectedStart = startOfDay(date).toISOString();
			const otherRunning = inspected.runningEntries.filter((entry) => entry.name !== pointer.name || entry.startTime !== expectedStart);
			if (otherRunning.length > 0) return { ok: false, reason: 'conflict', message: `${getDailyNoteFilename(date)} 已有其他运行计时` };
		}
		return { ok: true };
	}

	private async process(file: TFile, mutate: (content: string) => TimerContentMutation): Promise<TimerActionResult> {
		let result: TimerActionResult = { ok: true };
		let suppression = 0;
		try {
			await this.app.vault.process(file, (content) => {
				const mutation = mutate(content);
				result = mutation.result;
				if (!mutation.result.ok || !mutation.changed) return content;
				suppression = countMixedWords(mutation.content) - countMixedWords(content);
				this.writingStats.addTaskWriteSuppression(file.path, suppression);
				return mutation.content;
			});
			return result;
		} catch (error) {
			if (suppression !== 0) this.writingStats.addTaskWriteSuppression(file.path, -suppression);
			return { ok: false, reason: 'io-error', message: String(error) };
		}
	}
}

function snapshotFromContent(content: string, dateKey: string, filePath: string): TimerSnapshot {
	const inspected = inspectTimerContent(content);
	if (inspected.status === 'missing') {
		return { status: 'idle', preparation: 'no-tracker', dateKey, filePath, runningEntries: [] };
	}
	if (inspected.status === 'invalid' || inspected.status === 'multiple') {
		return {
			status: 'invalid',
			preparation: 'ready',
			dateKey,
			filePath,
			runningEntries: [],
			message: inspected.message,
		};
	}
	if (inspected.runningEntries.length > 1) {
		return {
			status: 'conflict',
			preparation: 'ready',
			dateKey,
			filePath,
			runningEntries: inspected.runningEntries,
			message: `发现 ${inspected.runningEntries.length} 个活动正在运行`,
		};
	}
	return {
		status: inspected.runningEntries.length === 1 ? 'running' : 'idle',
		preparation: 'ready',
		dateKey,
		filePath,
		runningEntries: inspected.runningEntries,
	};
}

function continuationDates(sourceDate: Date, now: Date): Date[] {
	const dates: Date[] = [];
	const today = getDailyNoteFilename(now);
	let cursor = nextMidnight(sourceDate);
	while (getDailyNoteFilename(cursor) <= today) {
		dates.push(new Date(cursor));
		cursor = nextMidnight(cursor);
	}
	return dates;
}

function dateFromKey(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function nextMidnight(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}
