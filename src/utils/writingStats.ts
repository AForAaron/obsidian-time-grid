import { Plugin, TAbstractFile, TFile } from 'obsidian';
import {
	DEFAULT_TASK_PANEL_STATE,
	DEFAULT_TASK_SETTINGS,
	DoneRange,
	TaskPanelState,
	TaskSettings,
} from '../types/task';
import { getDailyNoteFilename } from './dailyNotesParser';

export type WritingStatsData = {
	fileBaselines: Record<string, number>;
	dailyWordIncrements: Record<string, number>;
};

export type TimeGridPluginData = {
	writingStats: WritingStatsData;
	taskSettings: TaskSettings;
	taskPanelState: TaskPanelState;
};

export const DEFAULT_TIME_GRID_DATA: TimeGridPluginData = {
	writingStats: {
		fileBaselines: {},
		dailyWordIncrements: {},
	},
	taskSettings: { ...DEFAULT_TASK_SETTINGS },
	taskPanelState: {
		collapsed: { ...DEFAULT_TASK_PANEL_STATE.collapsed },
	},
};

export const HEATMAP_RANGES = {
	'3m': { label: '近3个月', weeks: 13 },
	'6m': { label: '近6个月', weeks: 26 },
	'1y': { label: '近1年', weeks: 52 },
} as const;

export class WritingStatsTracker {
	private plugin: Plugin;
	private data: TimeGridPluginData;
	private save: () => Promise<void>;
	private revision = 0;
	private pendingFiles = new Set<string>();
	private saveTimer: number | null = null;
	private processing = false;
	private taskWriteSuppressions = new Map<string, number>();

	constructor(plugin: Plugin, data: TimeGridPluginData, save: () => Promise<void>) {
		this.plugin = plugin;
		this.data = data;
		this.save = save;
	}

	async initializeBaselines(): Promise<void> {
		let changed = false;
		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (this.data.writingStats.fileBaselines[file.path] !== undefined) {
				continue;
			}
			const content = await this.plugin.app.vault.cachedRead(file);
			this.data.writingStats.fileBaselines[file.path] = countMixedWords(content);
			changed = true;
		}
		if (changed) {
			await this.save();
		}
	}

	registerEvents(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file) => {
				if (file instanceof TFile && isMarkdownFile(file)) {
					this.queueBaselineOnly(file);
				}
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', (file) => {
				if (file instanceof TFile && isMarkdownFile(file)) {
					this.queueProcess(file);
				}
			})
		);
	}

	getWordCountForDate(dateKey: string): number {
		return this.data.writingStats.dailyWordIncrements[dateKey] ?? 0;
	}

	getRevision(): number {
		return this.revision;
	}

	addTaskWriteSuppression(filePath: string, delta: number): void {
		if (delta === 0) return;
		const next = (this.taskWriteSuppressions.get(filePath) ?? 0) + delta;
		if (next === 0) this.taskWriteSuppressions.delete(filePath);
		else this.taskWriteSuppressions.set(filePath, next);
	}

	private queueBaselineOnly(file: TFile): void {
		void this.setBaselineOnly(file);
	}

	private async setBaselineOnly(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.cachedRead(file);
		this.data.writingStats.fileBaselines[file.path] = countMixedWords(content);
		this.scheduleSave();
	}

	private queueProcess(file: TFile): void {
		this.pendingFiles.add(file.path);
		void this.processQueue();
	}

	private async processQueue(): Promise<void> {
		if (this.processing) {
			return;
		}
		this.processing = true;
		try {
			while (this.pendingFiles.size > 0) {
				const [path] = this.pendingFiles;
				this.pendingFiles.delete(path);
				const file = this.plugin.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile && isMarkdownFile(file)) {
					await this.processFile(file);
				}
			}
		} finally {
			this.processing = false;
		}
	}

	private async processFile(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.cachedRead(file);
		const currentCount = countMixedWords(content);
		const previousCount = this.data.writingStats.fileBaselines[file.path];

		if (previousCount === undefined) {
			this.data.writingStats.fileBaselines[file.path] = currentCount;
			this.scheduleSave();
			return;
		}

		const delta = currentCount - previousCount;
		const taskDelta = this.taskWriteSuppressions.get(file.path) ?? 0;
		this.taskWriteSuppressions.delete(file.path);
		const effectiveDelta = getEffectiveWritingDelta(delta, taskDelta);
		if (effectiveDelta !== 0) {
			const todayKey = getDailyNoteFilename(new Date());
			this.data.writingStats.dailyWordIncrements[todayKey] =
				(this.data.writingStats.dailyWordIncrements[todayKey] ?? 0) + effectiveDelta;
			this.revision++;
		}

		this.data.writingStats.fileBaselines[file.path] = currentCount;
		this.scheduleSave();
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.save();
		}, 750);
	}
}

export function normalizeTimeGridData(raw: unknown): TimeGridPluginData {
	const input = (raw ?? {}) as Partial<TimeGridPluginData>;
	const taskSettings = input.taskSettings as Partial<TaskSettings> | undefined;
	return {
		writingStats: {
			fileBaselines: {
				...(input.writingStats?.fileBaselines ?? {}),
			},
			dailyWordIncrements: {
				...(input.writingStats?.dailyWordIncrements ?? {}),
			},
		},
		taskSettings: {
			...DEFAULT_TASK_SETTINGS,
			...(taskSettings ?? {}),
			doneRange: normalizeDoneRange(taskSettings?.doneRange),
			renderLimit: normalizeRenderLimit(taskSettings?.renderLimit),
		},
		taskPanelState: {
			collapsed: {
				...DEFAULT_TASK_PANEL_STATE.collapsed,
				...(input.taskPanelState?.collapsed ?? {}),
			},
		},
	};
}

export function countMixedWords(content: string): number {
	const withoutCodeBlocks = content
		.replace(/^---[\s\S]*?---\s*/m, '')
		.replace(/```[\s\S]*?```/g, ' ');
	const chineseChars = withoutCodeBlocks.match(/[\u3400-\u9fff]/g)?.length ?? 0;
	const latinWords = withoutCodeBlocks.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
	return chineseChars + latinWords;
}

export function getEffectiveWritingDelta(totalDelta: number, taskWriteDelta: number): number {
	return totalDelta - taskWriteDelta;
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}

function normalizeDoneRange(value: unknown): DoneRange {
	return value === '7days' || value === 'all' ? value : 'today';
}

function normalizeRenderLimit(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TASK_SETTINGS.renderLimit;
	return Math.min(1000, Math.max(1, Math.round(value)));
}
