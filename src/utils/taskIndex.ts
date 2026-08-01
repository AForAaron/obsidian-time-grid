import { App, TFile } from 'obsidian';
import { TaskSection, TaskSettings, TGTask } from '../types/task';
import { classifyTask, getTodayKey, isPathExcluded, parseTaskLine, sortTasks } from './taskParser';
import { DEFAULT_ROUTINE_DEFINITION_PATH } from '../types/routine';
import { getRoutineTaskLineNumbers } from './routineFormat';

export interface TaskIndexSnapshot {
	tasks: TGTask[];
	isIndexing: boolean;
	revision: number;
}

export class TaskIndex {
	private app: App;
	private getSettings: () => TaskSettings;
	private getRoutineDefinitionPath: () => string;
	private byFile = new Map<string, TGTask[]>();
	private listeners = new Set<() => void>();
	private debounceTimers = new Map<string, number>();
	private scanGeneration = 0;
	private indexing = false;
	private revision = 0;
	private today = getTodayKey();

	constructor(
		app: App,
		getSettings: () => TaskSettings,
		getRoutineDefinitionPath: () => string = () => DEFAULT_ROUTINE_DEFINITION_PATH
	) {
		this.app = app;
		this.getSettings = getSettings;
		this.getRoutineDefinitionPath = getRoutineDefinitionPath;
	}

	getSnapshot(): TaskIndexSnapshot {
		return {
			tasks: this.getAll(),
			isIndexing: this.indexing,
			revision: this.revision,
		};
	}

	getAll(): TGTask[] {
		return Array.from(this.byFile.values()).flat();
	}

	getBySection(section: TaskSection): TGTask[] {
		return sortTasks(section, this.getAll().filter((task) => task.section === section));
	}

	onChange(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	async rebuild(): Promise<void> {
		const generation = ++this.scanGeneration;
		const settings = this.getSettings();
		this.indexing = settings.enabled;
		this.notify(false);
		if (!settings.enabled) {
			this.byFile.clear();
			this.indexing = false;
			this.notify();
			return;
		}

		const next = new Map<string, TGTask[]>();
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((file) => !isPathExcluded(file.path, settings.excludedPaths));
		for (let index = 0; index < files.length; index++) {
			if (generation !== this.scanGeneration) return;
			const file = files[index];
			const tasks = await this.scanFile(file, settings);
			if (tasks.length > 0) next.set(file.path, tasks);
			if ((index + 1) % 50 === 0) {
				await yieldToMainThread();
			}
		}

		if (generation !== this.scanGeneration) return;
		this.byFile = next;
		this.indexing = false;
		this.notify();
	}

	scheduleReindex(file: TFile): void {
		window.clearTimeout(this.debounceTimers.get(file.path));
		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(file.path);
			void this.reindexFile(file);
		}, 300);
		this.debounceTimers.set(file.path, timer);
	}

	async reindexFile(file: TFile): Promise<void> {
		const settings = this.getSettings();
		if (!settings.enabled || isPathExcluded(file.path, settings.excludedPaths)) {
			this.dropFile(file.path);
			return;
		}
		const tasks = await this.scanFile(file, settings);
		if (tasks.length === 0) this.byFile.delete(file.path);
		else this.byFile.set(file.path, tasks);
		this.notify();
	}

	dropFile(path: string): void {
		window.clearTimeout(this.debounceTimers.get(path));
		this.debounceTimers.delete(path);
		if (this.byFile.delete(path)) this.notify();
	}

	refreshForDate(date = new Date()): void {
		const nextToday = getTodayKey(date);
		if (nextToday === this.today) return;
		this.today = nextToday;
		const goalTag = this.getSettings().goalTag;
		for (const tasks of this.byFile.values()) {
			for (const task of tasks) task.section = classifyTask(task, this.today, goalTag);
		}
		this.notify();
	}

	notifySettingsChanged(): void {
		void this.rebuild();
	}

	destroy(): void {
		this.scanGeneration++;
		for (const timer of this.debounceTimers.values()) window.clearTimeout(timer);
		this.debounceTimers.clear();
		this.listeners.clear();
	}

	private async scanFile(file: TFile, settings: TaskSettings): Promise<TGTask[]> {
		if (file.path === this.getRoutineDefinitionPath()) return [];
		const cache = this.app.metadataCache.getFileCache(file);
		const items = cache?.listItems?.filter((item) => item.task !== undefined) ?? [];
		if (items.length === 0) return [];
		const content = await this.app.vault.cachedRead(file);
		const routineLines = getRoutineTaskLineNumbers(content);
		const lines = content.split('\n');
		return items.filter((item) => !routineLines.has(item.position.start.line)).map((item) => {
			const line = item.position.start.line;
			const raw = (lines[line] ?? '').replace(/\r$/, '');
			return parseTaskLine(raw, file.path, line, this.today, settings.goalTag);
		});
	}

	private notify(incrementRevision = true): void {
		if (incrementRevision) this.revision++;
		for (const listener of this.listeners) listener();
	}
}

function yieldToMainThread(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}
