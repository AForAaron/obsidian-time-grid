import { ItemView, WorkspaceLeaf } from 'obsidian';
import { TimeHeatmap } from '../components/TimeHeatmap';
import { MonthHeatmap } from '../components/MonthHeatmap';
import { DayGrid } from '../components/DayGrid';
import { HourGrid } from '../components/HourGrid';
import { DailyPieChart } from '../components/DailyPieChart';
import { TaskPanel } from '../components/TaskPanel';
import { TaskPanelState, TaskSettings } from '../types/task';
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
	private updateInterval: number;

	constructor(
		leaf: WorkspaceLeaf,
		writingStats: WritingStatsTracker,
		taskIndex: TaskIndex,
		taskWriter: TaskWriter,
		getTaskSettings: () => TaskSettings,
		getTaskPanelState: () => TaskPanelState,
		saveTaskPanelState: (state: TaskPanelState) => Promise<void>
	) {
		super(leaf);
		this.writingStats = writingStats;
		this.taskIndex = taskIndex;
		this.taskWriter = taskWriter;
		this.getTaskSettings = getTaskSettings;
		this.getTaskPanelState = getTaskPanelState;
		this.saveTaskPanelState = saveTaskPanelState;
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

		// 创建垂直布局容器
		const wrapper = container.createDiv('tg-wrapper');

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
		this.taskPanel = new TaskPanel(wrapper, this.app, this.taskIndex, {
			getSettings: this.getTaskSettings,
			getState: this.getTaskPanelState,
			saveState: this.saveTaskPanelState,
			actions: {
				toggleDone: (task) => this.taskWriter.toggleDone(task),
				setStatus: (task, status) => this.taskWriter.setStatus(task, status),
				updateTask: (task, patch) => this.taskWriter.updateTask(task, patch),
			},
		});

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
		this.timeHeatmap.update(now);
		this.monthHeatmap.update(now);
		this.dayGrid.update(now);
		this.hourGrid.update(now);
		this.dailyPieChart.update(now);
		this.taskIndex.refreshForDate(now);
	}
}
