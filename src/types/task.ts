export type TaskSection =
	| 'overdue'
	| 'today'
	| 'unsorted'
	| 'goal'
	| 'future'
	| 'done';

export type TaskPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

export type TaskStatusKind = 'todo' | 'in-progress' | 'done' | 'cancelled' | 'unknown';

export type TaskFieldKind =
	| 'due'
	| 'scheduled'
	| 'start'
	| 'created'
	| 'doneDate'
	| 'cancelledDate'
	| 'priority'
	| 'recurrence'
	| 'id'
	| 'blocked';

export type TaskDiagnosticCode =
	| 'unparseable-line'
	| 'unknown-status'
	| 'invalid-date'
	| 'duplicate-field';

export interface TaskDiagnostic {
	code: TaskDiagnosticCode;
	message: string;
	blocking: boolean;
}

export interface TaskFieldToken {
	kind: TaskFieldKind;
	/** 0-indexed absolute offsets within raw. */
	start: number;
	end: number;
	raw: string;
	value?: string;
}

export interface TaskLineLayout {
	statusIndex: number;
	bodyStart: number;
	descriptionStart: number;
	descriptionEnd: number;
	metadataStart?: number;
	fields: TaskFieldToken[];
}

export interface TGTask {
	id: string;
	filePath: string;
	/** 0-indexed source line number. */
	line: number;
	raw: string;
	/** Everything before the checkbox status character. */
	indent: string;
	statusChar: string;
	status: TaskStatusKind;
	checked: boolean;
	description: string;
	due?: string;
	scheduled?: string;
	start?: string;
	created?: string;
	doneDate?: string;
	cancelledDate?: string;
	priority?: TaskPriority;
	trailing: string[];
	tags: string[];
	section: TaskSection;
	hasRecurrence: boolean;
	diagnostics: TaskDiagnostic[];
	layout?: TaskLineLayout;
}

export type DoneRange = 'today' | '7days' | 'all';

export interface TaskSettings {
	enabled: boolean;
	excludedPaths: string;
	goalTag: string;
	recordTerminalDate: boolean;
	showFileName: boolean;
	doneRange: DoneRange;
	renderLimit: number;
}

export interface TaskPanelState {
	collapsed: Partial<Record<TaskSection, boolean>>;
}

export type TimeGridMode = 'time' | 'tasks';

export interface TimeGridUiState {
	activeMode: TimeGridMode;
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
	enabled: true,
	excludedPaths: '00-Templates',
	goalTag: '#goal',
	recordTerminalDate: true,
	showFileName: false,
	doneRange: 'today',
	renderLimit: 50,
};

export const DEFAULT_TASK_PANEL_STATE: TaskPanelState = {
	collapsed: {
		unsorted: true,
		goal: true,
		future: true,
		done: true,
	},
};

export const DEFAULT_TIME_GRID_UI_STATE: TimeGridUiState = {
	activeMode: 'time',
};

export type WriteFailReason =
	| 'file-missing'
	| 'line-mismatch-not-found'
	| 'line-mismatch-ambiguous'
	| 'read-only-task'
	| 'io-error';

export type WriteResult =
	| { ok: true }
	| { ok: false; reason: WriteFailReason; message: string };

export type EditableTaskStatus = Exclude<TaskStatusKind, 'unknown'>;

export interface TaskPatch {
	description?: string;
	due?: string | null;
	priority?: TaskPriority | null;
	goal?: boolean;
	status?: EditableTaskStatus;
}
