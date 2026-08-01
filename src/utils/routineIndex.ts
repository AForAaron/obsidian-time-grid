import { App, TFile } from 'obsidian';
import {
	createEmptyRoutineSnapshot,
	RoutineDiagnostic,
	RoutineSettings,
	RoutineSnapshot,
} from '../types/routine';
import { TaskSettings } from '../types/task';
import { getDailyNoteFileForDate } from './dailyNotes';
import { getTodayKey } from './taskParser';
import { parseRoutineInstances, previousDateKey } from './routineFormat';
import { RoutineRepository } from './routineRepository';

export class RoutineIndex {
	private app: App;
	private repository: RoutineRepository;
	private getSettings: () => RoutineSettings;
	private getTaskSettings: () => TaskSettings;
	private listeners = new Set<() => void>();
	private timer: number | null = null;
	private generation = 0;
	private snapshot: RoutineSnapshot;

	constructor(
		app: App,
		repository: RoutineRepository,
		getSettings: () => RoutineSettings,
		getTaskSettings: () => TaskSettings
	) {
		this.app = app;
		this.repository = repository;
		this.getSettings = getSettings;
		this.getTaskSettings = getTaskSettings;
		const today = getTodayKey();
		this.snapshot = createEmptyRoutineSnapshot(today, previousDateKey(today));
	}

	getSnapshot(): RoutineSnapshot {
		return this.snapshot;
	}

	onChange(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	scheduleRebuild(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.rebuild();
		}, 300);
	}

	async rebuild(now = new Date()): Promise<void> {
		const generation = ++this.generation;
		const today = getTodayKey(now);
		const yesterday = previousDateKey(today);
		if (!this.getSettings().enabled) {
			this.snapshot = { ...createEmptyRoutineSnapshot(today, yesterday), revision: this.snapshot.revision + 1 };
			this.notify();
			return;
		}

		this.snapshot = { ...this.snapshot, isIndexing: true };
		this.notify();
		const definitionLoad = await this.repository.loadDocument();
		if (generation !== this.generation) return;
		const migrationPreview = definitionLoad.ready ? null : await this.repository.getMigrationPreview();
		if (generation !== this.generation) return;
		const diagnostics: RoutineDiagnostic[] = definitionLoad.diagnostics.map((message) => ({
			code: definitionLoad.ready ? 'definition-invalid' : 'definition-missing',
			message,
			blocking: true,
		}));

		const todayDate = dateFromKey(today);
		const yesterdayDate = dateFromKey(yesterday);
		const todayFile = getDailyNoteFileForDate(this.app, todayDate);
		const yesterdayFile = getDailyNoteFileForDate(this.app, yesterdayDate);
		let todayGroups: RoutineSnapshot['groups'] = [];
		if (todayFile && definitionLoad.ready) {
			const ensured = await this.repository.ensureInstances(todayFile, today, definitionLoad.document);
			if (!ensured.ok) diagnostics.push({ code: 'daily-slot-missing', message: ensured.message, blocking: true });
			const adopted = await this.repository.adoptTodayLegacyInstances(todayFile, today, definitionLoad.document);
			if (!adopted.ok) diagnostics.push({ code: 'instance-invalid', message: adopted.message, blocking: true });
		}
		if (generation !== this.generation) return;
		if (todayFile) {
			const content = await this.app.vault.read(todayFile);
			const parsed = parseRoutineInstances(content, todayFile.path, today, definitionLoad.document, this.getTaskSettings().goalTag);
			todayGroups = parsed.groups;
			diagnostics.push(...parsed.diagnostics);
		}

		let missed: RoutineSnapshot['yesterday']['missed'] = [];
		if (yesterdayFile) {
			const content = await this.app.vault.cachedRead(yesterdayFile);
			const parsed = parseRoutineInstances(content, yesterdayFile.path, yesterday, definitionLoad.document, this.getTaskSettings().goalTag);
			missed = parsed.instances.filter((instance) => instance.task.status === 'todo' || instance.task.status === 'in-progress');
		}
		if (generation !== this.generation) return;

		this.snapshot = {
			definition: definitionLoad.document,
			definitionReady: definitionLoad.ready,
			migrationRequired: Boolean(migrationPreview),
			today,
			todayNoteExists: Boolean(todayFile),
			todayFilePath: todayFile?.path,
			groups: todayGroups,
			yesterday: {
				date: yesterday,
				noteExists: Boolean(yesterdayFile),
				filePath: yesterdayFile?.path,
				missed,
			},
			diagnostics,
			isIndexing: false,
			revision: this.snapshot.revision + 1,
		};
		this.notify();
	}

	refreshForDate(now = new Date()): void {
		if (getTodayKey(now) !== this.snapshot.today) void this.rebuild(now);
	}

	destroy(): void {
		this.generation++;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.listeners.clear();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function dateFromKey(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day, 12, 0, 0, 0);
}
