export type TimerStatus =
	| 'idle'
	| 'running'
	| 'conflict'
	| 'invalid'
	| 'recovery-required'
	| 'write-error';

export type TimerPreparation = 'ready' | 'no-diary' | 'no-tracker';
export type TimeRange = '3m' | '6m' | '1y';

export interface TimerRecoveryPointer {
	name: string;
	startTime: string;
	sourceDate: string;
}

export interface TimerRecoveryState {
	active: TimerRecoveryPointer | null;
}

/**
 * 只存在于内存中的「这次计时是从哪条任务点开的」关联。
 * 绝不写入日记或 data.json：Obsidian 重载后关联即消失，宁可丢失也不猜错。
 * `raw` 用于按与 applyTaskEditToContent 相同的「原文全局唯一」规则重新定位任务，
 * `stateKey` 用于在计时切换、停止或跨日重建时判定关联已失效。
 */
export interface TaskTimerLink {
	filePath: string;
	raw: string;
	stateKey: string;
}

export interface RunningTimerEntry {
	name: string;
	startTime: string;
	path: number[];
}

export interface TimerRecoveryPreview {
	pointer: TimerRecoveryPointer;
	durationMs: number;
	affectedDates: string[];
}

export interface TimerSnapshot {
	status: TimerStatus;
	preparation: TimerPreparation;
	dateKey: string;
	filePath?: string;
	runningEntries: RunningTimerEntry[];
	recovery?: TimerRecoveryPreview;
	message?: string;
}

export type TimerSuggestionSource = 'recent' | 'task' | 'routine';

export interface TimerSuggestion {
	name: string;
	source: TimerSuggestionSource;
}

export type TimerFailureReason =
	| 'daily-notes-disabled'
	| 'invalid-name'
	| 'invalid-content'
	| 'conflict'
	| 'stale'
	| 'file-missing'
	| 'io-error';

export type TimerActionResult =
	| { ok: true; switchedFrom?: string }
	| { ok: false; reason: TimerFailureReason; message: string };

export const DEFAULT_TIMER_RECOVERY_STATE: TimerRecoveryState = { active: null };
