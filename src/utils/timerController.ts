import { RoutineIndex } from './routineIndex';
import { TaskIndex } from './taskIndex';
import {
	TaskTimerLink,
	TimerActionResult,
	TimerRecoveryPointer,
	TimerRecoveryState,
	TimerSnapshot,
	TimerSuggestion,
} from '../types/timer';
import { TGTask } from '../types/task';
import { getDailyNoteFilename } from './dailyNotesParser';
import { timerStateKey, timerSuggestionName } from './timerFormat';
import { resolveLinkedTask } from './taskTimer';

export { timerSuggestionName } from './timerFormat';
import { TimerRepository } from './timerRepository';

const DAY_MS = 24 * 60 * 60 * 1000;

export class TimerController {
	private repository: TimerRepository;
	private taskIndex: TaskIndex;
	private routineIndex: RoutineIndex;
	private getRecovery: () => TimerRecoveryState;
	private saveRecovery: (state: TimerRecoveryState) => Promise<void>;
	private snapshot: TimerSnapshot;
	private suggestions: TimerSuggestion[] = [];
	private listeners = new Set<() => void>();
	private refreshTimer: number | null = null;
	private midnightTimer: number | null = null;
	private refreshing = false;
	private pendingStart: string | null = null;
	/** 只存在于内存：Obsidian 重载后关联即消失，绝不落盘、绝不按名称反查。 */
	private taskLink: TaskTimerLink | null = null;
	private taskUnsubscribe: (() => void) | null = null;
	private routineUnsubscribe: (() => void) | null = null;

	constructor(
		repository: TimerRepository,
		taskIndex: TaskIndex,
		routineIndex: RoutineIndex,
		getRecovery: () => TimerRecoveryState,
		saveRecovery: (state: TimerRecoveryState) => Promise<void>
	) {
		this.repository = repository;
		this.taskIndex = taskIndex;
		this.routineIndex = routineIndex;
		this.getRecovery = getRecovery;
		this.saveRecovery = saveRecovery;
		this.snapshot = { status: 'idle', preparation: 'no-diary', dateKey: getDailyNoteFilename(new Date()), runningEntries: [] };
		this.taskUnsubscribe = this.taskIndex.onChange(() => void this.refreshSuggestions());
		this.routineUnsubscribe = this.routineIndex.onChange(() => void this.refreshSuggestions());
	}

	getSnapshot(): TimerSnapshot {
		return this.snapshot;
	}

	getSuggestions(): TimerSuggestion[] {
		return this.suggestions;
	}

	/**
	 * 记住「当前这次计时是从这条任务点开的」。只应在 start() 成功返回之后调用——
	 * 那时 refresh() 已跑完，快照里的 stateKey 才是这段计时的真实身份。
	 */
	linkRunningTimer(task: TGTask): void {
		if (this.snapshot.status !== 'running') return;
		this.taskLink = {
			filePath: task.filePath,
			raw: task.raw,
			stateKey: timerStateKey(this.snapshot),
		};
	}

	getTaskLink(): TaskTimerLink | null {
		return this.taskLink;
	}

	/** 按原文唯一性重新定位关联任务；定位不到或有重复一律返回 null。 */
	getLinkedTask(): TGTask | null {
		return this.taskLink ? resolveLinkedTask(this.taskLink, this.taskIndex.getAll()) : null;
	}

	clearTaskLink(): void {
		this.taskLink = null;
	}

	onChange(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	async initialize(now = new Date()): Promise<void> {
		await this.refresh(now);
		await this.refreshSuggestions(now);
	}

	async refreshNow(now = new Date()): Promise<void> {
		await this.refresh(now);
		await this.refreshSuggestions(now);
	}

	async start(name: string, now = new Date()): Promise<TimerActionResult> {
		if (this.snapshot.status === 'recovery-required') {
			return { ok: false, reason: 'stale', message: '请先处理跨日计时' };
		}
		const result = await this.repository.start(name, now, false);
		if (!result.ok && result.reason === 'conflict') this.pendingStart = name.trim();
		else if (result.ok) this.pendingStart = null;
		await this.refresh(now);
		if (result.ok) await this.refreshSuggestions(now);
		return result;
	}

	async stop(now = new Date()): Promise<TimerActionResult> {
		if (this.snapshot.status === 'recovery-required') {
			return { ok: false, reason: 'stale', message: '请先处理跨日计时' };
		}
		this.pendingStart = null;
		const result = await this.repository.stop(now, false);
		await this.refresh(now);
		return result;
	}

	async resolveConflict(now = new Date()): Promise<TimerActionResult> {
		const pending = this.pendingStart;
		const result = pending
			? await this.repository.start(pending, now, true)
			: await this.repository.stop(now, true);
		if (result.ok) this.pendingStart = null;
		await this.refresh(now);
		return result;
	}

	async resolveRecovery(mode: 'continue' | 'stop-at-midnight', now = new Date()): Promise<TimerActionResult> {
		const pointer = this.getRecovery().active;
		if (!pointer) return { ok: false, reason: 'stale', message: '没有等待处理的跨日计时' };
		const result = await this.repository.reconcileAcrossMidnight(pointer, now, mode);
		// Clear the stale pointer before refresh so >24h recovery does not re-enter
		// recovery-required after a successful continue / midnight stop.
		if (result.ok) await this.setRecovery(null);
		await this.refresh(now);
		return result;
	}

	tick(now = new Date()): void {
		if (getDailyNoteFilename(now) !== this.snapshot.dateKey) void this.refresh(now);
	}

	scheduleRefresh(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refresh();
		}, 180);
	}

	destroy(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
		this.taskUnsubscribe?.();
		this.routineUnsubscribe?.();
		this.listeners.clear();
	}

	private async refresh(now = new Date()): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		try {
			const pointer = this.getRecovery().active;
			const today = getDailyNoteFilename(now);
			if (pointer && pointer.sourceDate < today) {
				const durationMs = Math.max(0, now.getTime() - Date.parse(pointer.startTime));
				const inspected = await this.repository.inspectRecovery(pointer, now);
				if (!inspected.ok) {
					this.snapshot = { status: 'write-error', preparation: 'ready', dateKey: today, runningEntries: [], message: inspected.message };
					this.notify();
					return;
				}
				if (durationMs > DAY_MS) {
					this.snapshot = {
						status: 'recovery-required',
						preparation: 'ready',
						dateKey: today,
						runningEntries: [{ name: pointer.name, startTime: pointer.startTime, path: [] }],
						recovery: { pointer, durationMs, affectedDates: dateKeysBetween(pointer.sourceDate, today) },
					};
					this.notify();
					return;
				}
				const recovered = await this.repository.reconcileAcrossMidnight(pointer, now, 'continue');
				if (!recovered.ok) {
					this.snapshot = { status: 'write-error', preparation: 'ready', dateKey: today, runningEntries: [], message: recovered.message };
					this.notify();
					return;
				}
			}

			this.snapshot = await this.repository.getSnapshot(now);
			if (this.snapshot.status === 'running' && this.snapshot.runningEntries.length === 1) {
				const entry = this.snapshot.runningEntries[0];
				await this.setRecovery({ name: entry.name, startTime: entry.startTime, sourceDate: today });
			} else {
				await this.setRecovery(null);
			}
			this.scheduleMidnightReconcile(now);
			this.notify();
		} catch (error) {
			this.snapshot = {
				status: 'write-error',
				preparation: 'ready',
				dateKey: getDailyNoteFilename(now),
				runningEntries: [],
				message: String(error),
			};
			this.notify();
		} finally {
			this.refreshing = false;
		}
	}

	private async refreshSuggestions(now = new Date()): Promise<void> {
		const result: TimerSuggestion[] = [];
		const seen = new Set<string>();
		const add = (name: string, source: TimerSuggestion['source']) => {
			const normalized = timerSuggestionName(name);
			const key = normalized.toLocaleLowerCase();
			if (!normalized || seen.has(key)) return;
			seen.add(key);
			result.push({ name: normalized, source });
		};
		for (const name of await this.repository.getRecentNames(now, 7)) add(name, 'recent');
		for (const section of ['today', 'overdue'] as const) {
			for (const task of this.taskIndex.getBySection(section)) {
				if (task.status === 'todo' || task.status === 'in-progress') add(task.description, 'task');
			}
		}
		for (const group of this.routineIndex.getSnapshot().groups) {
			for (const instance of group.items) {
				if (instance.task.status === 'todo' || instance.task.status === 'in-progress') add(instance.task.description, 'routine');
			}
		}
		this.suggestions = result;
		this.notify();
	}

	/**
	 * 计时身份一变（停止、切换活动、跨日重建、进入冲突/异常态）就丢弃关联。
	 * 这一个判定覆盖了所有失效场景，不需要在各处手动清理。
	 */
	private invalidateStaleTaskLink(): void {
		if (this.taskLink && timerStateKey(this.snapshot) !== this.taskLink.stateKey) this.taskLink = null;
	}

	private async setRecovery(active: TimerRecoveryPointer | null): Promise<void> {
		const previous = this.getRecovery().active;
		if (samePointer(previous, active)) return;
		await this.saveRecovery({ active });
	}

	private notify(): void {
		this.invalidateStaleTaskLink();
		for (const listener of this.listeners) listener();
	}

	private scheduleMidnightReconcile(now: Date): void {
		if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
		this.midnightTimer = null;
		if (this.snapshot.status !== 'running') return;
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
		this.midnightTimer = window.setTimeout(() => {
			this.midnightTimer = null;
			void this.refresh(new Date());
		}, Math.max(1, midnight.getTime() - now.getTime()));
	}
}

function samePointer(a: TimerRecoveryPointer | null, b: TimerRecoveryPointer | null): boolean {
	return a?.name === b?.name && a?.startTime === b?.startTime && a?.sourceDate === b?.sourceDate;
}

function dateKeysBetween(source: string, today: string): string[] {
	const [year, month, day] = source.split('-').map(Number);
	const dates: string[] = [];
	let cursor = new Date(year, month - 1, day, 12, 0, 0, 0);
	while (getDailyNoteFilename(cursor) <= today) {
		dates.push(getDailyNoteFilename(cursor));
		cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12, 0, 0, 0);
	}
	return dates;
}
