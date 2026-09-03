import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { SundialTimeView } from '../components/SundialTimeView';
import { TaskPanel } from '../components/TaskPanel';
import { TaskPanelState, TaskSettings, TimeGridMode } from '../types/task';
import { TimeRange } from '../types/timer';
import { openOrCreateDailyNoteForDate, openOrCreateTodayDailyNote } from '../utils/dailyNotes';
import { TaskIndex } from '../utils/taskIndex';
import { TaskWriter } from '../utils/taskWriter';
import { WritingStatsTracker } from '../utils/writingStats';
import { RoutineIndex } from '../utils/routineIndex';
import { RoutineRepository } from '../utils/routineRepository';
import { RoutineWriter } from '../utils/routineWriter';
import { RoutineManagerModal } from '../components/RoutineManagerModal';
import { RoutineMigrationModal } from '../components/RoutineMigrationModal';
import { RoutineItemEditModal } from '../components/RoutineItemEditModal';
import { RoutinePromoteModal } from '../components/RoutinePromoteModal';
import { TimerController } from '../utils/timerController';
import { TimerStopModal } from '../components/TimerStopModal';
import { canCompleteLinkedTask, stopTaskTimer } from '../utils/taskTimer';

export const TIME_GRID_VIEW = 'time-grid-view';

export class TimeGridView extends ItemView {
	private writingStats: WritingStatsTracker;
	private sundialTimeView: SundialTimeView;
	private timerController: TimerController;
	private taskPanel: TaskPanel;
	private taskIndex: TaskIndex;
	private taskWriter: TaskWriter;
	private routineRepository: RoutineRepository;
	private routineIndex: RoutineIndex;
	private routineWriter: RoutineWriter;
	private getTaskSettings: () => TaskSettings;
	private getTaskPanelState: () => TaskPanelState;
	private saveTaskPanelState: (state: TaskPanelState) => Promise<void>;
	private getActiveMode: () => TimeGridMode;
	private saveActiveMode: (mode: TimeGridMode) => Promise<void>;
	private getTimeRange: () => TimeRange;
	private saveTimeRange: (range: TimeRange) => Promise<void>;
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
		routineRepository: RoutineRepository,
		routineIndex: RoutineIndex,
		routineWriter: RoutineWriter,
		timerController: TimerController,
		getTaskSettings: () => TaskSettings,
		getTaskPanelState: () => TaskPanelState,
		saveTaskPanelState: (state: TaskPanelState) => Promise<void>,
		getActiveMode: () => TimeGridMode,
		saveActiveMode: (mode: TimeGridMode) => Promise<void>,
		getTimeRange: () => TimeRange,
		saveTimeRange: (range: TimeRange) => Promise<void>
	) {
		super(leaf);
		this.writingStats = writingStats;
		this.taskIndex = taskIndex;
		this.taskWriter = taskWriter;
		this.routineRepository = routineRepository;
		this.routineIndex = routineIndex;
		this.routineWriter = routineWriter;
		this.timerController = timerController;
		this.getTaskSettings = getTaskSettings;
		this.getTaskPanelState = getTaskPanelState;
		this.saveTaskPanelState = saveTaskPanelState;
		this.getActiveMode = getActiveMode;
		this.saveActiveMode = saveActiveMode;
		this.getTimeRange = getTimeRange;
		this.saveTimeRange = saveTimeRange;
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
		this.sundialTimeView = new SundialTimeView(
			this.timePane,
			this.app,
			this.writingStats,
			this.timerController,
			{
				getRange: this.getTimeRange,
				saveRange: this.saveTimeRange,
				onOpenToday: () => void openOrCreateTodayDailyNote(this.app),
				onDateClick: (date) => void openOrCreateDailyNoteForDate(this.app, date, true),
				requestStop: () => this.requestStopTimer(),
			}
		);
		this.taskPanel = new TaskPanel(this.taskPane, this.app, this.taskIndex, {
			getSettings: this.getTaskSettings,
			getState: this.getTaskPanelState,
			saveState: this.saveTaskPanelState,
			timer: {
				getSnapshot: () => this.timerController.getSnapshot(),
				onChange: (callback) => this.timerController.onChange(callback),
				start: (name) => this.timerController.start(name),
				requestStop: () => this.requestStopTimer(),
				linkTask: (task) => this.timerController.linkRunningTimer(task),
				getLinkedTask: () => this.timerController.getLinkedTask(),
				completeTask: (task) => this.taskWriter.setStatus(task, 'done'),
				openTimeView: () => {
					this.activeMode = 'time';
					this.applyMode(true);
					this.modeButtons.get('time')?.focus();
				},
			},
			routineIndex: this.routineIndex,
			routineActions: {
				createTodayNote: async () => {
					await openOrCreateTodayDailyNote(this.app);
					await this.routineIndex.rebuild();
				},
				openYesterday: () => this.openRoutineYesterday(),
				openManager: () => new RoutineManagerModal(this.app, this.routineIndex, this.routineWriter).open(),
				openMigration: () => new RoutineMigrationModal(this.app, this.routineRepository, this.routineWriter, () => void this.routineIndex.rebuild()).open(),
				editFuture: (instance) => this.openFutureEditor(instance),
				addTodayToFuture: (instance) => new RoutinePromoteModal(
					this.app,
					this.routineWriter,
					instance,
					this.routineIndex.getSnapshot().definition.groups,
					() => void this.routineIndex.rebuild()
				).open(),
				skipToday: (instance) => this.routineWriter.skipToday(instance),
			},
			actions: {
				toggleDone: async (task) => {
					const result = await this.taskWriter.toggleDone(task);
					if (result.ok && task.routine) await this.routineIndex.rebuild();
					return result;
				},
				setStatus: async (task, status) => {
					const result = await this.taskWriter.setStatus(task, status);
					if (result.ok && task.routine) await this.routineIndex.rebuild();
					return result;
				},
				updateTask: async (task, patch) => {
					const result = await this.taskWriter.updateTask(task, patch);
					if (result.ok && task.routine) await this.routineIndex.rebuild();
					return result;
				},
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

	/**
	 * 唯一的停止入口。有可完成的关联任务时先弹窗询问（因此「继续计时」才有意义），
	 * 否则保持原有行为直接停止。
	 */
	private async requestStopTimer(): Promise<void> {
		const snapshot = this.timerController.getSnapshot();
		const linked = snapshot.status === 'running' ? this.timerController.getLinkedTask() : null;
		if (!linked || !canCompleteLinkedTask(linked)) {
			const result = await this.timerController.stop();
			if (!result.ok) new Notice(result.message);
			else new Notice('计时已停止；任务状态保持不变');
			return;
		}
		new TimerStopModal(this.app, {
			task: linked,
			getSnapshot: () => this.timerController.getSnapshot(),
			openTimeView: () => {
				this.activeMode = 'time';
				this.applyMode(true);
				this.modeButtons.get('time')?.focus();
			},
			stop: (complete) => {
				// 必须在停止之前解析：计时一停，关联就按 stateKey 变化被判定失效。
				// 这样拿到的是弹窗打开期间可能已被外部改写的最新任务原文。
				const target = this.timerController.getLinkedTask() ?? linked;
				return stopTaskTimer({
					stopTimer: () => this.timerController.stop(),
					complete: complete
						? async () => {
							const result = await this.taskWriter.setStatus(target, 'done');
							if (result.ok && target.routine) await this.routineIndex.rebuild();
							return result;
						}
						: undefined,
				});
			},
		}).open();
	}

	async onClose(): Promise<void> {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
		this.taskPanel?.destroy();
		this.sundialTimeView?.destroy();
	}

	private updateAll(): void {
		const now = new Date();
		if (this.activeMode === 'time') this.updateTime(now);
		this.taskIndex.refreshForDate(now);
		this.routineIndex.refreshForDate(now);
	}

	private async openRoutineYesterday(): Promise<void> {
		const path = this.routineIndex.getSnapshot().yesterday.filePath;
		const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
		if (!(file instanceof TFile)) return void new Notice('昨日未创建日记');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private openFutureEditor(instance: import('../types/routine').RoutineInstance): void {
		if (!instance.itemId) return;
		const groups = this.routineIndex.getSnapshot().definition.groups;
		const group = groups.find((candidate) => candidate.id === instance.groupId);
		const item = group?.items.find((candidate) => candidate.id === instance.itemId);
		if (!group || !item) return void new Notice('找不到对应的未来流程定义，请重新扫描');
		new RoutineItemEditModal(this.app, this.routineWriter, groups, group.id, item, () => void this.routineIndex.rebuild(), instance).open();
	}

	private updateTime(now: Date): void {
		this.sundialTimeView.update(now);
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
