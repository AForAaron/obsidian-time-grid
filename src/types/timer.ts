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
