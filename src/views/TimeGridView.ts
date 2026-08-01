import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { TimeHeatmap } from '../components/TimeHeatmap';
import { MonthHeatmap } from '../components/MonthHeatmap';
import { DayGrid } from '../components/DayGrid';
import { HourGrid } from '../components/HourGrid';
import { DailyPieChart } from '../components/DailyPieChart';
import { TaskPanel } from '../components/TaskPanel';
import { TaskPanelState, TaskSettings, TimeGridMode } from '../types/task';
import { openOrCreateDailyNoteForDate, openOrCreateTodayDailyNote } from '../utils/dailyNotes';
import { TaskIndex } from '../utils/taskIndex';
import { TaskWriter } from '../utils/taskWriter';
import { WritingStatsTracker } from '../utils/writingStats';

export const TIME_GRID_VIEW = 'time-grid-view';

export class TimeGridView extends ItemView {
	private writingStats: WritingStatsTracker;
	private timeHeatmap: TimeHeatmap;
	private monthHeatmap: MonthHeatmap;
	private dayGrid: DayGrid;
	private hourGrid: HourGrid;
	private dailyPieChart: DailyPieChart;
	private taskPanel: TaskPanel;
	private taskIndex: TaskIndex;
	private taskWriter: TaskWriter;
	private getTaskSettings: () => TaskSettings;
	private getTaskPanelState: () => TaskPanelState;
	private saveTaskPanelState: (state: TaskPanelState) => Promise<void>;
	private getActiveMode: () => TimeGridMode;
	private saveActiveMode: (mode: TimeGridMode) => Promise<void>;
	private activeMode: TimeGridMode = 'time';
	private timePane: HTMLElement;
	private taskPane: HTMLElement;
	private modeButtons = new Map<TimeGridMode, HTMLButtonElement>();
	private updateInterval: number;

	constructor(
		leaf: WorkspaceLeaf,
		writingStats: WritingStatsTracker,
		taskIndex: TaskIndex,
		taskWriter: TaskWriter,
		getTaskSettings: () => TaskSettings,
		getTaskPanelState: () => TaskPanelState,
		saveTaskPanelState: (state: TaskPanelState) => Promise<void>,
		getActiveMode: () => TimeGridMode,
		saveActiveMode: (mode: TimeGridMode) => Promise<void>
	) {
		super(leaf);
		this.writingStats = writingStats;
		this.taskIndex = taskIndex;
		this.taskWriter = taskWriter;
		this.getTaskSettings = getTaskSettings;
		this.getTaskPanelState = getTaskPanelState;
		this.saveTaskPanelState = saveTaskPanelState;
		this.getActiveMode = getActiveMode;
		this.saveActiveMode = saveActiveMode;
	}

	getViewType(): string {
		return TIME_GRID_VIEW;
	}

	getDisplayText(): string {
		return 'Time Grid';
	}

	getIcon(): string {
		return 'clock';
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('tg-container');

		const viewHeader = container.createDiv('tg-view-header');
		const switcher = viewHeader.createDiv({ cls: 'tg-view-switcher', attr: { role: 'tablist', 'aria-label': 'Time Grid 视图' } });
		this.createModeButton(switcher, 'time', 'clock-3', '时间');
		this.createModeButton(switcher, 'tasks', 'list-checks', '任务');

		const panes = container.createDiv('tg-view-panes');
		this.timePane = panes.createDiv({ cls: 'tg-view-pane tg-time-view', attr: { role: 'tabpanel' } });
		this.taskPane = panes.createDiv({ cls: 'tg-view-pane tg-task-view', attr: { role: 'tabpanel' } });
		const wrapper = this.timePane.createDiv('tg-wrapper');

		// 初始化三个组件
		this.timeHeatmap = new TimeHeatmap(wrapper, this.app, this.writingStats, {
			onTitleClick: () => void openOrCreateTodayDailyNote(this.app),
			onDateClick: (date) => void openOrCreateDailyNoteForDate(this.app, date, true),
		});
		this.monthHeatmap = new MonthHeatmap(wrapper, {
			onTitleClick: () => void openOrCreateTodayDailyNote(this.app),
			onDateClick: (date) => void openOrCreateDailyNoteForDate(this.app, date, true),
		});
		this.dayGrid = new DayGrid(wrapper);
		this.hourGrid = new HourGrid(wrapper);
		this.dailyPieChart = new DailyPieChart(wrapper, this.app);
		this.taskPanel = new TaskPanel(this.taskPane, this.app, this.taskIndex, {
			getSettings: this.getTaskSettings,
			getState: this.getTaskPanelState,
			saveState: this.saveTaskPanelState,
			actions: {
				toggleDone: (task) => this.taskWriter.toggleDone(task),
				setStatus: (task, status) => this.taskWriter.setStatus(task, status),
				updateTask: (task, patch) => this.taskWriter.updateTask(task, patch),
				postponeTask: (task, days) => this.taskWriter.postponeTask(task, days),
				deleteTask: (task) => this.taskWriter.deleteTask(task),
			},
		});
		this.activeMode = this.getActiveMode();
		this.applyMode(false);

		// 每秒更新一次（节流到 1 秒，降低内存占用）
		this.updateInterval = window.setInterval(() => {
			this.updateAll();
		}, 1000);

		// 初始渲染
		this.updateAll();
	}

	async onClose(): Promise<void> {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
		this.taskPanel?.destroy();
	}

	private updateAll(): void {
		const now = new Date();
		if (this.activeMode === 'time') this.updateTime(now);
		this.taskIndex.refreshForDate(now);
	}

	private updateTime(now: Date): void {
		this.timeHeatmap.update(now);
		this.monthHeatmap.update(now);
		this.dayGrid.update(now);
		this.hourGrid.update(now);
		this.dailyPieChart.update(now);
	}

	private createModeButton(parent: HTMLElement, mode: TimeGridMode, icon: string, label: string): void {
		const button = parent.createEl('button', {
			cls: 'tg-view-switcher-button',
			attr: { role: 'tab', 'aria-label': `${label}视图` },
		});
		const iconEl = button.createSpan('tg-view-switcher-icon');
		setIcon(iconEl, icon);
		button.createSpan({ cls: 'tg-view-switcher-label', text: label });
		button.addEventListener('click', () => {
			if (this.activeMode === mode) return;
			this.activeMode = mode;
			this.applyMode(true);
		});
		button.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			event.preventDefault();
			const next: TimeGridMode = this.activeMode === 'time' ? 'tasks' : 'time';
			this.activeMode = next;
			this.applyMode(true);
			this.modeButtons.get(next)?.focus();
		});
		this.modeButtons.set(mode, button);
	}

	private applyMode(persist: boolean): void {
		const timeActive = this.activeMode === 'time';
		this.timePane.toggleClass('is-active', timeActive);
		this.taskPane.toggleClass('is-active', !timeActive);
		this.timePane.setAttr('aria-hidden', String(!timeActive));
		this.taskPane.setAttr('aria-hidden', String(timeActive));
		for (const [mode, button] of this.modeButtons) {
			const selected = mode === this.activeMode;
			button.toggleClass('is-active', selected);
			button.setAttr('aria-selected', String(selected));
			button.tabIndex = selected ? 0 : -1;
		}
		if (timeActive) this.updateTime(new Date());
		if (persist) void this.saveActiveMode(this.activeMode);
	}
}
