import { TaskPriority, TGTask, WriteResult } from './task';

export type RoutineWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RoutineSchedule {
	weekdays: RoutineWeekday[];
	activeFrom?: string;
	activeUntil?: string;
	reminderTime?: string;
}

export interface RoutineItemDefinition {
	id: string;
	title: string;
	enabled: boolean;
	order: number;
	priority?: TaskPriority;
	schedule: RoutineSchedule;
}

export interface RoutineGroupDefinition {
	id: string;
	title: string;
	subtitle?: string;
	enabled: boolean;
	order: number;
	items: RoutineItemDefinition[];
}

export interface RoutineDocument {
	version: 1;
	groups: RoutineGroupDefinition[];
}

export type RoutineDiagnosticCode =
	| 'definition-missing'
	| 'definition-invalid'
	| 'duplicate-id'
	| 'daily-note-missing'
	| 'daily-slot-missing'
	| 'instance-invalid'
	| 'migration-required';

export interface RoutineDiagnostic {
	code: RoutineDiagnosticCode;
	message: string;
	blocking: boolean;
}

export interface RoutineInstance {
	id: string;
	groupId: string;
	itemId?: string;
	date: string;
	reminderTime?: string;
	todayOnly: boolean;
	legacy: boolean;
	task: TGTask;
}

export interface RoutineGroupViewModel {
	id: string;
	title: string;
	subtitle?: string;
	enabled: boolean;
	order: number;
	items: RoutineInstance[];
}

export interface RoutineYesterdayState {
	date: string;
	noteExists: boolean;
	filePath?: string;
	missed: RoutineInstance[];
}

export interface RoutineSnapshot {
	definition: RoutineDocument;
	definitionReady: boolean;
	migrationRequired: boolean;
	today: string;
	todayNoteExists: boolean;
	todayFilePath?: string;
	groups: RoutineGroupViewModel[];
	yesterday: RoutineYesterdayState;
	diagnostics: RoutineDiagnostic[];
	isIndexing: boolean;
	revision: number;
}

export interface RoutineSettings {
	enabled: boolean;
	definitionPath: string;
	migrationVersion: number;
	reminderLog: Record<string, boolean>;
}

export interface RoutineMigrationPreview {
	templatePath: string;
	backupPath: string;
	groups: RoutineGroupDefinition[];
	taskCount: number;
}

export interface RoutineDefinitionPatch {
	title?: string;
	subtitle?: string;
	enabled?: boolean;
	priority?: TaskPriority;
	clearPriority?: boolean;
	weekdays?: RoutineWeekday[];
	activeFrom?: string | null;
	activeUntil?: string | null;
	reminderTime?: string | null;
}

export interface RoutineActions {
	createTodayNote: () => Promise<void>;
	openYesterday: () => Promise<void>;
	openManager: () => void;
	openMigration: () => void;
	editFuture: (instance: RoutineInstance) => void;
	addTodayToFuture: (instance: RoutineInstance) => void;
	skipToday: (instance: RoutineInstance) => Promise<WriteResult>;
}

export const DEFAULT_ROUTINE_DEFINITION_PATH = '00-Templates/Time Grid Routines.md';

export const DEFAULT_ROUTINE_SETTINGS: RoutineSettings = {
	enabled: true,
	definitionPath: DEFAULT_ROUTINE_DEFINITION_PATH,
	migrationVersion: 0,
	reminderLog: {},
};

export const EMPTY_ROUTINE_DOCUMENT: RoutineDocument = { version: 1, groups: [] };

export function createEmptyRoutineSnapshot(today: string, yesterday: string): RoutineSnapshot {
	return {
		definition: EMPTY_ROUTINE_DOCUMENT,
		definitionReady: false,
		migrationRequired: false,
		today,
		todayNoteExists: false,
		groups: [],
		yesterday: { date: yesterday, noteExists: false, missed: [] },
		diagnostics: [],
		isIndexing: false,
		revision: 0,
	};
}
