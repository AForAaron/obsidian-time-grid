import { App, MarkdownView, Notice, setIcon, TFile } from 'obsidian';
import {
	EditableTaskStatus,
	TaskPatch,
	TaskPanelState,
	TaskPriority,
	TaskSection,
	TaskSettings,
	TaskStatusKind,
	TGTask,
	WriteResult,
} from '../types/task';
import { RoutineActions, RoutineGroupViewModel, RoutineInstance, RoutineSnapshot } from '../types/routine';
import { TimerActionResult, TimerSnapshot } from '../types/timer';
import { TaskEditModal } from './TaskEditModal';
import { TaskDeleteConfirmModal } from './TaskDeleteConfirmModal';
import { TaskTimerModal } from './TaskTimerModal';
import { TaskCreateModal } from './TaskCreateModal';
import { TaskIndex } from '../utils/taskIndex';
import { getTodayKey, sortTasks, terminalDate } from '../utils/taskParser';
import { getTaskWriteBlockReason } from '../utils/taskWriter';
import {
	countFilteredSections,
	createEmptyTaskFilters,
	filterTasks,
	groupFutureTasks,
	hasActiveTaskFilters,
	TaskFilterState,
	TaskPriorityFilter,
} from '../utils/taskView';
import { getRoutineProgress, getTaskMenuActions, positionFloatingLayer, TaskMenuAction } from '../utils/taskUi';
import { RoutineIndex } from '../utils/routineIndex';
import { displayRoutineTitle } from '../utils/routineMarker';
import { isRoutineReminderDue } from '../utils/routineReminder';
import { formatTimerElapsed } from '../utils/timerFormat';
import { canCompleteLinkedTask, canStartTimerFromTask, startTaskTimer, taskTimerDefaultName } from '../utils/taskTimer';

type PersistedSection = 'unsorted' | 'goal' | 'future' | 'done';

interface TaskPanelOptions {
	getSettings: () => TaskSettings;
	getState: () => TaskPanelState;
	saveState: (state: TaskPanelState) => Promise<void>;
	routineIndex?: RoutineIndex;
	routineActions?: RoutineActions;
	actions?: {
		toggleDone: (task: TGTask) => Promise<WriteResult>;
		setStatus: (task: TGTask, status: EditableTaskStatus) => Promise<WriteResult>;
		updateTask: (task: TGTask, patch: TaskPatch) => Promise<WriteResult>;
		postponeTask: (task: TGTask, days: number) => Promise<WriteResult>;
		deleteTask: (task: TGTask) => Promise<WriteResult>;
		createTask: (description: string, due: string | null) => Promise<WriteResult>;
	};
	timer?: {
		getSnapshot: () => TimerSnapshot;
		onChange: (callback: () => void) => () => void;
		start: (name: string) => Promise<TimerActionResult>;
		/** 统一停止入口：有关联任务时会先弹窗询问是否同时完成。 */
		requestStop: () => Promise<void>;
		/** 计时成功启动后记录「这次计时来自这条任务」，只存在于内存。 */
		linkTask: (task: TGTask) => void;
		getLinkedTask: () => TGTask | null;
		completeTask: (task: TGTask) => Promise<WriteResult>;
		openTimeView: () => void;
	};
}

const SECTION_CONFIG: Array<{ section: TaskSection; icon: string; label: string; subtitle: string }> = [
	{ section: 'overdue', icon: 'circle-alert', label: '逾期', subtitle: '需要重新安排' },
	{ section: 'today', icon: 'sun', label: '今天', subtitle: '今天要推进' },
	{ section: 'unsorted', icon: 'inbox', label: '待分类', subtitle: '尚未安排日期' },
	{ section: 'goal', icon: 'mountain', label: '长期', subtitle: '长期方向与目标' },
	{ section: 'future', icon: 'calendar-days', label: '未来', subtitle: '接下来的安排' },
	{ section: 'done', icon: 'archive', label: '已结束', subtitle: '已完成与已取消' },
];

const STATUS_OPTIONS: Array<{ value: TaskStatusKind; editable?: EditableTaskStatus; label: string; icon: string }> = [
	{ value: 'todo', editable: 'todo', label: '待办', icon: 'circle' },
	{ value: 'in-progress', editable: 'in-progress', label: '进行中', icon: 'circle-dot-dashed' },
	{ value: 'done', editable: 'done', label: '完成', icon: 'circle-check' },
	{ value: 'cancelled', editable: 'cancelled', label: '取消', icon: 'circle-x' },
	{ value: 'unknown', label: '未知状态', icon: 'circle-help' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriorityFilter; label: string; glyph: string }> = [
	{ value: 'highest', label: '最高', glyph: '🔺' },
	{ value: 'high', label: '高', glyph: '⏫' },
	{ value: 'medium', label: '中', glyph: '🔼' },
	{ value: 'low', label: '低', glyph: '🔽' },
	{ value: 'lowest', label: '最低', glyph: '⏬' },
	{ value: 'none', label: '无优先级', glyph: '–' },
];

export class TaskPanel {
	private container: HTMLElement;
	private app: App;
	private index: TaskIndex;
	private options: TaskPanelOptions;
	private unsubscribe: (() => void) | null = null;
	private unsubscribeRoutine: (() => void) | null = null;
	private unsubscribeTimer: (() => void) | null = null;
	private expandedSections = new Set<TaskSection>();
	private expandedTasks = new Set<string>();
	private pendingStatuses = new Map<string, EditableTaskStatus>();
	private pendingTasks = new Set<string>();
	private filters: TaskFilterState = createEmptyTaskFilters();
	private filterPanelOpen = false;
	private collapsedRoutineGroups = new Set<string>();
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;
	private previewCloseTimer: number | null = null;
	private previewAnchor: HTMLElement | null = null;
	private layerEl: HTMLElement | null = null;
	private layerAnchor: HTMLElement | null = null;
	private layerKind: 'filter' | 'menu' | null = null;
	private timerStripEl: HTMLElement | null = null;
	private timerElapsedEl: HTMLElement | null = null;
	private timerTickInterval: number | null = null;
	private timerActionBusy = false;
	private readonly handleScroll = () => {
		this.closePreview();
		this.dismissLayer(false);
	};
	private readonly handleResize = () => {
		this.closePreview();
		this.dismissLayer(false);
	};
	private readonly handleKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		this.closePreview();
		this.dismissLayer(true);
	};
	private readonly handleBlur = () => {
		this.closePreview();
		this.dismissLayer(false);
	};
	private readonly handleDocumentPointerDown = (event: PointerEvent) => {
		if (!this.layerEl || !(event.target instanceof Element)) return;
		if (this.layerEl.contains(event.target) || this.layerAnchor?.contains(event.target)) return;
		this.dismissLayer(false);
	};

	constructor(parent: HTMLElement, app: App, index: TaskIndex, options: TaskPanelOptions) {
		this.container = parent.createDiv('tg-task-panel');
		this.app = app;
		this.index = index;
		this.options = options;
		this.unsubscribe = this.index.onChange(() => this.render());
		this.unsubscribeRoutine = this.options.routineIndex?.onChange(() => this.render()) ?? null;
		this.unsubscribeTimer = this.options.timer?.onChange(() => this.renderTimerStrip()) ?? null;
		this.container.closest('.tg-container')?.addEventListener('scroll', this.handleScroll, { passive: true });
		window.addEventListener('resize', this.handleResize, { passive: true });
		window.addEventListener('keydown', this.handleKeydown);
		window.addEventListener('blur', this.handleBlur);
		document.addEventListener('pointerdown', this.handleDocumentPointerDown);
		this.render();
	}

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.unsubscribeRoutine?.();
		this.unsubscribeRoutine = null;
		this.unsubscribeTimer?.();
		this.unsubscribeTimer = null;
		this.stopTimerTicker();
		this.container.closest('.tg-container')?.removeEventListener('scroll', this.handleScroll);
		window.removeEventListener('resize', this.handleResize);
		window.removeEventListener('keydown', this.handleKeydown);
		window.removeEventListener('blur', this.handleBlur);
		document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
		this.closePreview();
		this.removeLayer();
		this.container.remove();
	}

	render(): void {
		this.closePreview();
		this.removeLayer();
		const outerScroll = this.container.closest('.tg-container') as HTMLElement | null;
		const previousScrollTop = outerScroll?.scrollTop ?? 0;
		const searchFocused = document.activeElement?.classList.contains('tg-task-search-input') ?? false;
		const searchSelection = searchFocused && document.activeElement instanceof HTMLInputElement
			? [document.activeElement.selectionStart, document.activeElement.selectionEnd] as const
			: null;
		const settings = this.options.getSettings();
		this.container.toggleClass('is-hidden', !settings.enabled);
		this.container.empty();
		this.timerStripEl = null;
		this.timerElapsedEl = null;
		if (!settings.enabled) {
			this.stopTimerTicker();
			return;
		}

		const snapshot = this.index.getSnapshot();
		const routineSnapshot = this.options.routineIndex?.getSnapshot();
		const routineInstances = routineSnapshot?.groups.flatMap((group) => group.items) ?? [];
		const allTasks = snapshot.tasks.concat(routineInstances.map((instance) => instance.task));
		this.renderHeader(allTasks, snapshot.isIndexing || Boolean(routineSnapshot?.isIndexing));
		this.renderTimerStrip();
		if ((snapshot.isIndexing || routineSnapshot?.isIndexing) && allTasks.length === 0) {
			this.renderLoading();
			this.restoreScroll(outerScroll, previousScrollTop);
			return;
		}

		const ordinaryTasks = snapshot.tasks;
		const displayBase = ordinaryTasks.filter((task) => task.section !== 'done')
			.concat(filterTerminalTasks(ordinaryTasks.filter((task) => task.section === 'done'), settings.doneRange))
			.concat(routineInstances.map((instance) => instance.task));
		const filteredTasks = filterTasks(displayBase, this.filters);
		const counts = countFilteredSections(displayBase, filteredTasks);
		const filtering = hasActiveTaskFilters(this.filters);

		if (allTasks.length === 0 && !routineSnapshot) this.renderEmpty('还没有任务', '在任意笔记里写 “- [ ] 内容” 即可被 Time Grid 汇总。', 'list-plus');
		else if (filteredTasks.length === 0 && filtering) this.renderEmpty('没有匹配的任务', '换个关键词，或清除筛选条件后再试。', 'search-x', true);

		const totalOverRenderThreshold = displayBase.length > 200;
		const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
		const visibleRoutineGroups = routineSnapshot
			? routineSnapshot.groups.map((group) => ({ ...group, items: group.items.filter((item) => filteredTaskIds.has(item.task.id)) }))
				.filter((group) => group.items.length > 0 || !filtering)
			: [];
		if (routineSnapshot && (!filtering || visibleRoutineGroups.length > 0)) {
			this.renderRoutineArea(this.container.createDiv('tg-routine-area'), routineSnapshot, visibleRoutineGroups);
		}
		for (const config of SECTION_CONFIG) {
			const sectionTasks = sortTasks(config.section, filteredTasks.filter((task) => task.section === config.section && !task.routine));
			if (config.section === 'done') {
				sectionTasks.push(...filteredTasks.filter((task) => task.section === 'done' && Boolean(task.routine)));
			}
			this.renderSection(
				config,
				sectionTasks,
				counts.filtered[config.section] ?? 0,
				counts.total[config.section] ?? 0,
				filtering,
				totalOverRenderThreshold,
				settings.renderLimit
			);
		}
		this.restoreScroll(outerScroll, previousScrollTop);
		if (searchFocused) {
			window.requestAnimationFrame(() => {
				const input = this.container.querySelector<HTMLInputElement>('.tg-task-search-input');
				input?.focus();
				if (input && searchSelection) input.setSelectionRange(searchSelection[0], searchSelection[1]);
			});
		}
	}

	private renderHeader(tasks: TGTask[], isIndexing: boolean): void {
		const header = this.container.createDiv('tg-task-center-header');
		const heading = header.createDiv('tg-task-center-heading');
		const titleBox = heading.createDiv('tg-task-center-title-box');
		titleBox.createEl('h2', { cls: 'tg-task-center-title', text: '任务中心' });
		titleBox.createDiv({ cls: 'tg-task-center-subtitle', text: '聚焦现在，轻松安排接下来' });
		const actions = heading.createDiv('tg-task-center-actions');
		if (this.options.actions) {
			const create = actions.createEl('button', {
				cls: 'tg-task-icon-button',
				attr: { 'aria-label': '新建任务', title: '新建任务' },
			});
			setIcon(create, 'plus');
			create.addEventListener('click', () => this.openCreateModal());
		}
		const refresh = actions.createEl('button', {
			cls: 'tg-task-icon-button',
			attr: { 'aria-label': '重新索引任务', title: '重新索引任务' },
		});
		setIcon(refresh, 'refresh-cw');
		if (isIndexing) refresh.addClass('is-spinning');
		refresh.addEventListener('click', () => void this.index.rebuild());

		const active = tasks.filter((task) => task.section !== 'done').length;
		const stats = [
			{ label: '总任务', value: tasks.length, tone: 'total', icon: 'list-checks' },
			{ label: '逾期', value: countSection(tasks, 'overdue'), tone: 'overdue', icon: 'circle-alert' },
			{ label: '今天', value: countSection(tasks, 'today'), tone: 'today', icon: 'sun' },
			{ label: '活跃', value: active, tone: 'active', icon: 'activity' },
		];
		const statsEl = header.createDiv('tg-task-stats');
		for (const stat of stats) {
			const card = statsEl.createDiv(`tg-task-stat is-${stat.tone}`);
			const icon = card.createSpan('tg-task-stat-icon');
			setIcon(icon, stat.icon);
			const text = card.createDiv('tg-task-stat-text');
			text.createSpan({ cls: 'tg-task-stat-value', text: String(stat.value) });
			text.createSpan({ cls: 'tg-task-stat-label', text: stat.label });
		}
		this.renderSearchAndFilters(header, tasks);
	}

	private renderTimerStrip(): void {
		this.stopTimerTicker();
		this.timerStripEl?.remove();
		this.timerStripEl = null;
		this.timerElapsedEl = null;
		const timer = this.options.timer;
		const header = this.container.querySelector<HTMLElement>('.tg-task-center-header');
		if (!timer || !header) return;
		const snapshot = timer.getSnapshot();
		if (snapshot.status === 'idle') return;

		const strip = this.container.createDiv(`tg-task-timer-strip is-${snapshot.status}`);
		header.after(strip);
		this.timerStripEl = strip;
		if (snapshot.status === 'running' && snapshot.runningEntries[0]) {
			const entry = snapshot.runningEntries[0];
			const indicator = strip.createSpan('tg-task-timer-strip-indicator');
			indicator.createSpan('tg-task-timer-strip-dot');
			const copy = strip.createDiv('tg-task-timer-strip-copy');
			copy.createSpan({ cls: 'tg-task-timer-strip-label', text: '正在计时' });
			copy.createSpan({ cls: 'tg-task-timer-strip-name', text: entry.name, attr: { title: entry.name } });
			this.timerElapsedEl = strip.createSpan({
				cls: 'tg-task-timer-strip-elapsed',
				text: formatTimerElapsed(Date.now() - Date.parse(entry.startTime)),
			});
			const stop = strip.createEl('button', {
				cls: 'tg-task-timer-strip-stop',
				text: this.timerActionBusy ? '停止中…' : '停止',
				attr: { type: 'button', 'aria-label': `停止计时：${entry.name}` },
			});
			stop.disabled = this.timerActionBusy;
			stop.addEventListener('click', () => void this.stopTimerFromTaskView());
			this.startTimerTicker(entry.startTime);
			return;
		}

		const icon = strip.createSpan('tg-task-timer-strip-warning-icon');
		setIcon(icon, 'triangle-alert');
		const copy = strip.createDiv('tg-task-timer-strip-copy');
		copy.createSpan({ cls: 'tg-task-timer-strip-label', text: '计时需要处理' });
		copy.createSpan({ cls: 'tg-task-timer-strip-name', text: timerStatusCopy(snapshot), attr: { title: snapshot.message ?? '' } });
		const open = strip.createEl('button', { cls: 'tg-task-timer-strip-open', text: '到时间页处理', attr: { type: 'button' } });
		open.addEventListener('click', () => timer.openTimeView());
	}

	private startTimerTicker(startTime: string): void {
		const update = () => {
			if (this.timerElapsedEl) this.timerElapsedEl.textContent = formatTimerElapsed(Date.now() - Date.parse(startTime));
		};
		update();
		this.timerTickInterval = window.setInterval(update, 1000);
	}

	private stopTimerTicker(): void {
		if (this.timerTickInterval !== null) window.clearInterval(this.timerTickInterval);
		this.timerTickInterval = null;
	}

	private async stopTimerFromTaskView(): Promise<void> {
		if (!this.options.timer || this.timerActionBusy) return;
		this.timerActionBusy = true;
		this.renderTimerStrip();
		try {
			await this.options.timer.requestStop();
		} catch (error) {
			new Notice(`停止计时失败：${String(error)}`);
		} finally {
			this.timerActionBusy = false;
			this.renderTimerStrip();
		}
	}

	private renderSearchAndFilters(parent: HTMLElement, tasks: TGTask[]): void {
		const controls = parent.createDiv('tg-task-controls');
		const search = controls.createDiv('tg-task-search');
		const searchIcon = search.createSpan('tg-task-search-icon');
		setIcon(searchIcon, 'search');
		const input = search.createEl('input', {
			cls: 'tg-task-search-input',
			attr: { type: 'search', placeholder: '搜索任务、标签或文件…', 'aria-label': '搜索任务' },
		});
		input.value = this.filters.query;
		input.addEventListener('input', () => {
			this.filters.query = input.value;
			this.render();
		});
		if (this.filters.query) {
			const clear = search.createEl('button', { cls: 'tg-task-search-clear', attr: { 'aria-label': '清空搜索' } });
			setIcon(clear, 'x');
			clear.addEventListener('click', () => {
				this.filters.query = '';
				this.render();
			});
		}

		const filterButtons = controls.createDiv('tg-task-filter-buttons');
		const filterButton = this.createFilterButton(filterButtons, 'sliders-horizontal', '筛选', this.activeFilterCount());
		if (hasActiveTaskFilters(this.filters)) {
			const reset = filterButtons.createEl('button', { cls: 'tg-task-filter-reset', text: '清除', attr: { 'aria-label': '清除全部搜索和筛选' } });
			reset.addEventListener('click', () => {
				this.filters = createEmptyTaskFilters();
				this.render();
			});
		}
		if (this.filterPanelOpen) this.renderFilterPanel(filterButton, tasks);
	}

	private createFilterButton(parent: HTMLElement, iconName: string, label: string, count: number): HTMLButtonElement {
		const button = parent.createEl('button', {
			cls: `tg-task-filter-button${count ? ' is-active' : ''}`,
			attr: { 'aria-expanded': String(this.filterPanelOpen), 'aria-label': `${label}筛选${count ? `，已选 ${count} 项` : ''}` },
		});
		const icon = button.createSpan('tg-task-filter-icon');
		setIcon(icon, iconName);
		button.createSpan({ cls: 'tg-task-filter-label', text: label });
		if (count) button.createSpan({ cls: 'tg-task-filter-count', text: String(count) });
		button.addEventListener('click', () => {
			this.filterPanelOpen = !this.filterPanelOpen;
			this.render();
		});
		return button;
	}

	private renderFilterPanel(anchor: HTMLElement, tasks: TGTask[]): void {
		const panel = document.body.createDiv({ cls: 'tg-task-filter-panel tg-task-layer', attr: { role: 'dialog', 'aria-label': '任务筛选' } });
		this.renderFilterGroup(panel, '状态', STATUS_OPTIONS.map((option) => ({
			value: option.value,
			label: option.label,
			selected: this.filters.statuses.has(option.value),
			toggle: () => toggleSetValue(this.filters.statuses, option.value),
		})));
		this.renderFilterGroup(panel, '优先级', PRIORITY_OPTIONS.map((option) => ({
			value: option.value,
			label: `${option.glyph} ${option.label}`,
			selected: this.filters.priorities.has(option.value),
			toggle: () => toggleSetValue(this.filters.priorities, option.value),
		})));
		const sourceGroup = panel.createDiv('tg-task-filter-group tg-task-filter-source-group');
		sourceGroup.createDiv({ cls: 'tg-task-filter-group-title', text: '来源文件' });
		const sources = [...new Set(tasks.map((task) => task.filePath))].sort((a, b) => a.localeCompare(b));
		const list = sourceGroup.createDiv('tg-task-source-list');
		for (const source of sources) {
			const selected = this.filters.sources.has(source);
			const button = list.createEl('button', {
				cls: `tg-task-source-option${selected ? ' is-selected' : ''}`,
				attr: { 'aria-pressed': String(selected), title: source },
			});
			const check = button.createSpan('tg-task-source-check');
			setIcon(check, selected ? 'check-square-2' : 'square');
			button.createSpan({ text: source });
			button.addEventListener('click', () => {
				toggleSetValue(this.filters.sources, source);
				this.render();
			});
		}
		const footer = panel.createDiv('tg-task-filter-footer');
		footer.createSpan({ text: this.activeFilterCount() ? `已选 ${this.activeFilterCount()} 项` : '未选择筛选条件' });
		if (hasActiveTaskFilters(this.filters)) {
			const clear = footer.createEl('button', { text: '清除全部' });
			clear.addEventListener('click', () => {
				this.filters = createEmptyTaskFilters();
				this.filterPanelOpen = true;
				this.render();
			});
		}
		const done = footer.createEl('button', { text: '完成' });
		done.addEventListener('click', () => {
			this.filterPanelOpen = false;
			this.render();
		});
		this.setLayer(panel, anchor, 'filter', 'bottom');
	}

	private renderFilterGroup(parent: HTMLElement, title: string, options: Array<{ value: string; label: string; selected: boolean; toggle: () => void }>): void {
		const group = parent.createDiv('tg-task-filter-group');
		group.createDiv({ cls: 'tg-task-filter-group-title', text: title });
		const choices = group.createDiv('tg-task-filter-choices');
		for (const option of options) {
			const button = choices.createEl('button', {
				cls: `tg-task-filter-choice${option.selected ? ' is-selected' : ''}`,
				text: option.label,
				attr: { 'aria-pressed': String(option.selected) },
			});
			button.addEventListener('click', () => {
				option.toggle();
				this.render();
			});
		}
	}

	private renderLoading(): void {
		const loading = this.container.createDiv('tg-task-loading');
		for (let index = 0; index < 3; index++) {
			const row = loading.createDiv('tg-task-skeleton');
			row.createSpan('tg-task-skeleton-check');
			const text = row.createDiv('tg-task-skeleton-text');
			text.createSpan();
			text.createSpan();
		}
		loading.createDiv({ cls: 'tg-task-loading-label', text: '正在建立任务索引…' });
	}

	private renderEmpty(title: string, body: string, iconName: string, showReset = false): void {
		const empty = this.container.createDiv('tg-task-empty');
		const icon = empty.createSpan('tg-task-empty-icon');
		setIcon(icon, iconName);
		empty.createDiv({ cls: 'tg-task-empty-title', text: title });
		empty.createDiv({ cls: 'tg-task-empty-body', text: body });
		if (showReset) {
			const reset = empty.createEl('button', { text: '清除搜索与筛选' });
			reset.addEventListener('click', () => {
				this.filters = createEmptyTaskFilters();
				this.render();
			});
		}
	}

	private renderSection(
		config: { section: TaskSection; icon: string; label: string; subtitle: string },
		tasks: TGTask[],
		filteredCount: number,
		totalCount: number,
		filtering: boolean,
		limitEnabled: boolean,
		renderLimit: number
	): void {
		const sectionEl = this.container.createDiv(`tg-task-section tg-task-section-${config.section}`);
		const collapsed = this.isCollapsed(config.section);
		const heading = sectionEl.createEl('button', {
			cls: 'tg-task-section-heading',
			attr: { 'aria-expanded': String(!collapsed), 'aria-controls': `tg-task-list-${config.section}` },
		});
		const headingMain = heading.createSpan('tg-task-section-heading-main');
		const icon = headingMain.createSpan('tg-task-section-icon');
		setIcon(icon, config.icon);
		const labels = headingMain.createSpan('tg-task-section-labels');
		labels.createSpan({ cls: 'tg-task-section-title', text: config.label });
		labels.createSpan({ cls: 'tg-task-section-subtitle', text: config.subtitle });
		const headingMeta = heading.createSpan('tg-task-section-heading-meta');
		headingMeta.createSpan({
			cls: 'tg-task-section-count',
			text: filtering ? `${filteredCount} / ${totalCount}` : String(totalCount),
		});
		if (config.section !== 'overdue' && config.section !== 'today') {
			const chevron = headingMeta.createSpan('tg-task-chevron');
			setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
		}
		if (config.section === 'overdue' || config.section === 'today') heading.setAttr('aria-disabled', 'true');
		else heading.addEventListener('click', () => void this.toggleSection(config.section));
		if (collapsed || tasks.length === 0) return;

		const list = sectionEl.createDiv({ cls: 'tg-task-list', attr: { id: `tg-task-list-${config.section}` } });
		const shouldLimit = limitEnabled && !this.expandedSections.has(config.section) && tasks.length > renderLimit;
		const visible = shouldLimit ? tasks.slice(0, renderLimit) : tasks;
		if (config.section === 'future') this.renderFutureGroups(list, visible);
		else for (const task of visible) this.renderTaskRow(list, task);
		if (shouldLimit) {
			const more = sectionEl.createEl('button', { cls: 'tg-task-more', text: `再显示 ${tasks.length - visible.length} 条` });
			more.addEventListener('click', () => {
				this.expandedSections.add(config.section);
				this.render();
			});
		}
	}

	private renderRoutineArea(parent: HTMLElement, snapshot: RoutineSnapshot, visibleGroups: RoutineGroupViewModel[]): void {
		if (snapshot.migrationRequired) {
			const migration = parent.createDiv('tg-routine-message is-migration');
			const icon = migration.createSpan('tg-routine-message-icon');
			setIcon(icon, 'sparkles');
			const copy = migration.createDiv('tg-routine-message-copy');
			copy.createDiv({ cls: 'tg-routine-message-title', text: '启用每日流程' });
			copy.createDiv({ text: '检测到现有日记模板，可先预览再安全导入流程项目。' });
			const button = migration.createEl('button', { text: '查看迁移预览' });
			button.addEventListener('click', () => this.options.routineActions?.openMigration());
		}
		if (!snapshot.todayNoteExists) {
			const missing = parent.createDiv('tg-routine-message is-empty');
			const icon = missing.createSpan('tg-routine-message-icon');
			setIcon(icon, 'notebook-pen');
			const copy = missing.createDiv('tg-routine-message-copy');
			copy.createDiv({ cls: 'tg-routine-message-title', text: '创建今日日记后启用每日流程' });
			copy.createDiv({ text: '创建后会按今天的计划生成独立实例。' });
			const button = missing.createEl('button', { text: '创建今日日记' });
			button.addEventListener('click', () => void this.options.routineActions?.createTodayNote());
		}
		const visibleDiagnostics = snapshot.diagnostics.filter((item) =>
			item.code !== 'definition-missing' && !(snapshot.migrationRequired && item.code === 'definition-invalid'));
		if (visibleDiagnostics.length > 0) {
			const diagnostic = parent.createDiv('tg-routine-message is-diagnostic');
			const icon = diagnostic.createSpan('tg-routine-message-icon');
			setIcon(icon, 'triangle-alert');
			const copy = diagnostic.createDiv('tg-routine-message-copy');
			copy.createDiv({ cls: 'tg-routine-message-title', text: '每日流程需要检查' });
			copy.createDiv({ text: visibleDiagnostics.map((item) => item.message).join('；') });
		}
		for (const group of visibleGroups) {
			const original = snapshot.groups.find((candidate) => candidate.id === group.id) ?? group;
			this.renderRoutineGroup(parent, original, group.items);
		}
		if (snapshot.definitionReady) {
			const manage = parent.createEl('button', { cls: 'tg-routine-manage-button', text: '管理每日流程' });
			const icon = manage.createSpan('tg-task-meta-icon');
			setIcon(icon, 'settings-2');
			manage.prepend(icon);
			manage.addEventListener('click', () => this.options.routineActions?.openManager());
		}
		this.renderYesterdayReminder(parent, snapshot);
	}

	private renderYesterdayReminder(parent: HTMLElement, snapshot: RoutineSnapshot): void {
		const reminder = parent.createDiv(`tg-routine-yesterday${snapshot.yesterday.missed.length ? ' has-missed' : ''}`);
		const icon = reminder.createSpan('tg-routine-message-icon');
		setIcon(icon, snapshot.yesterday.noteExists ? (snapshot.yesterday.missed.length ? 'circle-alert' : 'circle-check') : 'calendar-x');
		const copy = reminder.createDiv('tg-routine-message-copy');
		if (!snapshot.yesterday.noteExists) {
			copy.createDiv({ cls: 'tg-routine-message-title', text: '昨日未创建日记' });
			copy.createDiv({ text: snapshot.yesterday.date });
			return;
		}
		if (snapshot.yesterday.missed.length === 0) {
			copy.createDiv({ cls: 'tg-routine-message-title', text: '昨日流程已处理' });
		} else {
			copy.createDiv({ cls: 'tg-routine-message-title', text: `昨日漏做 ${snapshot.yesterday.missed.length} 项` });
			copy.createDiv({ text: snapshot.yesterday.missed.map((item) => displayRoutineTitle(item.task.description)).join('、') });
		}
		const open = reminder.createEl('button', { text: '打开昨日记' });
		open.addEventListener('click', () => void this.options.routineActions?.openYesterday());
	}

	private renderRoutineGroup(parent: HTMLElement, group: RoutineGroupViewModel, visibleItems = group.items): void {
		const progress = getRoutineProgress(group);
		if (!progress) return;
		const wrapper = parent.createDiv('tg-routine-group');
		const header = wrapper.createDiv('tg-routine-header');
		const collapsed = this.collapsedRoutineGroups.has(group.id);
		const summary = header.createEl('button', {
			cls: 'tg-routine-summary',
			attr: { 'aria-expanded': String(!collapsed), 'aria-controls': `tg-routine-items-${group.id}` },
		});
		const icon = summary.createSpan('tg-routine-icon');
		setIcon(icon, 'refresh-cw');
		const copy = summary.createSpan('tg-routine-copy');
		copy.createSpan({ cls: 'tg-routine-title', text: group.title });
		copy.createSpan({ cls: 'tg-routine-subtitle', text: group.subtitle ?? '今天的固定例行事项' });
		summary.createSpan({ cls: 'tg-routine-progress', text: `${progress.completed} / ${progress.total}` });
		const chevron = summary.createSpan('tg-routine-chevron');
		setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
		summary.addEventListener('click', () => {
			if (collapsed) this.collapsedRoutineGroups.delete(group.id);
			else this.collapsedRoutineGroups.add(group.id);
			this.render();
		});
		const manage = header.createEl('button', { cls: 'tg-routine-group-menu', attr: { 'aria-label': `管理组合：${group.title}`, title: '管理组合' } });
		setIcon(manage, 'settings-2');
		manage.addEventListener('click', () => this.options.routineActions?.openManager());
		if (collapsed) return;
		const items = wrapper.createDiv({ cls: 'tg-routine-items', attr: { id: `tg-routine-items-${group.id}` } });
		for (const item of visibleItems) this.renderTaskRow(items, item.task);
	}

	private renderFutureGroups(parent: HTMLElement, tasks: TGTask[]): void {
		const groups = groupFutureTasks(tasks, getTodayKey());
		for (const [key, label] of [['tomorrow', '明天'], ['next7', '7 天内'], ['later', '更晚']] as const) {
			if (groups[key].length === 0) continue;
			const group = parent.createDiv('tg-task-future-group');
			const heading = group.createDiv('tg-task-future-heading');
			heading.createSpan({ text: label });
			heading.createSpan({ cls: 'tg-task-future-count', text: String(groups[key].length) });
			for (const task of groups[key]) this.renderTaskRow(group, task);
		}
	}

	private renderTaskRow(parent: HTMLElement, task: TGTask): void {
		const optimisticStatus = this.pendingStatuses.get(task.id);
		const displayStatus: TaskStatusKind = optimisticStatus ?? task.status;
		const blockReason = getTaskWriteBlockReason(task);
		const mutationPending = this.pendingTasks.has(task.id);
		const expanded = this.expandedTasks.has(task.id);
		const row = parent.createDiv(`tg-task-row tg-task-status-${displayStatus} tg-task-tone-${task.section}${task.routine ? ' is-routine' : ''}`);
		row.setAttr('data-task-id', task.id);
		if (blockReason) row.addClass('is-read-only');
		if (optimisticStatus || mutationPending) row.addClass('is-pending');
		if (expanded) row.addClass('is-expanded');

		const main = row.createDiv('tg-task-row-main');
		const checkbox = main.createEl('button', {
			cls: 'tg-task-checkbox',
			attr: {
				'aria-label': `${displayStatus === 'done' || displayStatus === 'cancelled' ? '重新打开' : '完成'}任务：${task.description || task.raw.trim()}`,
				title: blockReason ?? '完成或重新打开',
			},
		});
		setIcon(checkbox, checkboxIcon(displayStatus));
		checkbox.disabled = Boolean(blockReason || optimisticStatus || mutationPending || !this.options.actions);
		checkbox.addEventListener('click', () => void this.runToggle(task));

		const content = main.createDiv('tg-task-card-content');
		const title = content.createEl('button', {
			cls: 'tg-task-description',
			text: taskTitle(task),
			attr: { 'aria-expanded': String(expanded), title: '' },
		});
		title.addEventListener('click', (event) => {
			if (event.metaKey || event.ctrlKey) {
				void this.openSource(task);
				return;
			}
			if (isFinePointer()) this.openEditor(task);
			else {
				if (expanded) this.expandedTasks.delete(task.id);
				else this.expandedTasks.add(task.id);
				this.render();
			}
		});
		title.addEventListener('mouseenter', () => this.schedulePreview(row, task, title));
		title.addEventListener('mouseleave', () => this.schedulePreviewClose());
		title.addEventListener('focus', () => this.schedulePreview(row, task, title));
		title.addEventListener('blur', () => this.schedulePreviewClose());

		const meta = content.createDiv('tg-task-meta');
		if (task.due) {
			const due = meta.createSpan({ cls: 'tg-task-due', text: formatDue(task.due) });
			const dueIcon = due.createSpan('tg-task-meta-icon');
			setIcon(dueIcon, 'calendar');
			due.prepend(dueIcon);
			if (task.section === 'overdue') due.addClass('is-overdue');
		}
		const statusButton = meta.createEl('button', {
			cls: `tg-task-status-control is-${displayStatus}`,
			attr: { 'aria-label': `任务状态：${statusLabel(displayStatus, Boolean(task.routine))}，点击更改`, 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
		});
		statusButton.createSpan({ cls: `tg-task-status-badge is-${displayStatus}`, text: statusLabel(displayStatus, Boolean(task.routine)) });
		statusButton.disabled = Boolean(blockReason || mutationPending || !this.options.actions);
		statusButton.addEventListener('click', (event) => this.openStatusMenu(event, statusButton, task));
		if (task.priority) meta.createSpan({ cls: `tg-task-priority is-${task.priority}`, text: `${priorityGlyph(task.priority)} ${priorityLabel(task.priority)}` });
		if (task.routine?.reminderTime) {
			const instance = this.findRoutineInstance(task);
			const due = instance ? isRoutineReminderDue(instance, new Date(), this.options.routineIndex?.getSnapshot().today ?? getTodayKey()) : false;
			meta.createSpan({ cls: `tg-routine-reminder-time${due ? ' is-due' : ''}`, text: due ? `已到时间 · ${task.routine.reminderTime}` : task.routine.reminderTime });
		}
		if (task.routine?.todayOnly) meta.createSpan({ cls: 'tg-task-readonly-badge', text: '仅今天' });
		if (this.options.getSettings().showFileName) meta.createSpan({ cls: 'tg-task-file', text: fileName(task.filePath), attr: { title: task.filePath } });
		if (task.hasRecurrence) meta.createSpan({ cls: 'tg-task-readonly-badge', text: '循环 · 只读' });
		else if (blockReason) meta.createSpan({ cls: 'tg-task-readonly-badge', text: '只读' });

		const more = main.createEl('button', { cls: 'tg-task-more-button', attr: { 'aria-label': '更多任务操作', 'aria-haspopup': 'menu', 'aria-expanded': 'false' } });
		setIcon(more, 'ellipsis');
		more.addEventListener('click', (event) => this.openMoreMenu(event, more, task, blockReason));

		if (!blockReason && this.options.actions) {
			const hoverActions = row.createDiv('tg-task-hover-actions');
			this.createIconAction(hoverActions, 'pencil', task.routine ? '编辑今天' : '编辑任务', () => this.openEditor(task));
			if (!task.routine && task.due) this.createIconAction(hoverActions, 'calendar-plus', '顺延一天；按住 Shift 顺延一周', (event) =>
				this.runMutation(task, () => this.options.actions!.postponeTask(task, event.shiftKey ? 7 : 1)));
		}

		if (expanded) {
			const details = row.createDiv('tg-task-inline-expanded');
			details.createDiv({ cls: 'tg-task-inline-title', text: taskTitle(task) });
			if (task.due) details.createDiv({ cls: 'tg-task-inline-due', text: `到期：${task.due}` });
			details.createDiv({ cls: 'tg-task-inline-source', text: `${task.filePath} · 第 ${task.line + 1} 行` });
			if (blockReason) details.createDiv({ cls: 'tg-task-inline-diagnostic', text: blockReason });
		}
	}

	private openStatusMenu(event: MouseEvent, anchor: HTMLElement, task: TGTask): void {
		event.stopPropagation();
		if (!this.options.actions || getTaskWriteBlockReason(task)) return;
		const menu = document.body.createDiv({ cls: 'tg-task-menu tg-task-layer', attr: { role: 'menu', 'aria-label': '选择任务状态' } });
		for (const option of STATUS_OPTIONS.filter((item) => item.editable)) {
			const selected = task.status === option.value;
			const item = menu.createEl('button', {
				cls: `tg-task-menu-item${selected ? ' is-selected' : ''}`,
				attr: { role: 'menuitemradio', 'aria-checked': String(selected), type: 'button' },
			});
			const icon = item.createSpan('tg-task-menu-icon');
			setIcon(icon, option.icon);
			item.createSpan({ cls: 'tg-task-menu-label', text: task.routine && option.value === 'cancelled' ? '跳过今天' : option.label });
			const check = item.createSpan('tg-task-menu-check');
			if (selected) setIcon(check, 'check');
			item.addEventListener('click', () => {
				this.removeLayer();
				void this.runSetStatus(task, option.editable!);
			});
		}
		this.setLayer(menu, anchor, 'menu', 'bottom');
		this.enableMenuKeyboard(menu);
	}

	private openMoreMenu(event: MouseEvent, anchor: HTMLElement, task: TGTask, blockReason: string | null): void {
		event.stopPropagation();
		if (task.routine) {
			this.openRoutineMoreMenu(anchor, task, blockReason);
			return;
		}
		const writable = Boolean(!blockReason && this.options.actions);
		const actions = getTaskMenuActions(task, writable, Boolean(this.options.timer));
		const menu = document.body.createDiv({ cls: 'tg-task-menu tg-task-layer', attr: { role: 'menu', 'aria-label': '任务操作' } });
		let previousGroup = '';
		for (const action of actions) {
			const config = taskMenuActionConfig(action);
			if (previousGroup && previousGroup !== config.group) menu.createDiv('tg-task-menu-separator');
			previousGroup = config.group;
			const item = menu.createEl('button', {
				cls: `tg-task-menu-item${config.danger ? ' is-danger' : ''}`,
				attr: { role: 'menuitem', type: 'button' },
			});
			const icon = item.createSpan('tg-task-menu-icon');
			setIcon(icon, config.icon);
			const label = action === 'start-timer' && this.options.timer?.getSnapshot().status === 'running'
				? '切换计时到此任务'
				: config.label;
			item.createSpan({ cls: 'tg-task-menu-label', text: label });
			item.addEventListener('click', () => {
				this.removeLayer();
				this.runMenuAction(action, task, blockReason);
			});
		}
		this.setLayer(menu, anchor, 'menu', 'bottom');
		this.enableMenuKeyboard(menu);
	}

	private openRoutineMoreMenu(anchor: HTMLElement, task: TGTask, blockReason: string | null): void {
		const instance = this.findRoutineInstance(task);
		const menu = document.body.createDiv({ cls: 'tg-task-menu tg-task-layer', attr: { role: 'menu', 'aria-label': '每日流程操作' } });
		const actions: Array<{ label: string; icon: string; danger?: boolean; run: () => void }> = [];
		if (this.options.timer && canStartTimerFromTask(task)) {
			actions.push({
				label: this.options.timer.getSnapshot().status === 'running' ? '切换计时到此任务' : '开始计时',
				icon: 'play',
				run: () => this.openTimerModal(task, Boolean(!blockReason && this.options.actions)),
			});
		}
		if (!blockReason && this.options.actions) {
			actions.push({ label: '编辑今天', icon: 'pencil', run: () => this.openEditor(task) });
			if (instance?.itemId) actions.push({ label: '修改以后每天', icon: 'calendar-cog', run: () => this.options.routineActions?.editFuture(instance) });
			else if (instance) actions.push({ label: '加入以后每天', icon: 'calendar-plus', run: () => this.options.routineActions?.addTodayToFuture(instance) });
			if (instance && task.status !== 'cancelled' && task.status !== 'done') {
				actions.push({ label: '跳过今天', icon: 'circle-slash-2', danger: true, run: () => void this.options.routineActions?.skipToday(instance) });
			}
		}
		if (blockReason) actions.push({ label: '查看只读原因', icon: 'info', run: () => new Notice(blockReason) });
		actions.push({ label: '打开今日日记', icon: 'file-text', run: () => void this.openSource(task) });
		for (const action of actions) {
			const item = menu.createEl('button', { cls: `tg-task-menu-item${action.danger ? ' is-danger' : ''}`, attr: { role: 'menuitem', type: 'button' } });
			const icon = item.createSpan('tg-task-menu-icon');
			setIcon(icon, action.icon);
			item.createSpan({ cls: 'tg-task-menu-label', text: action.label });
			item.addEventListener('click', () => {
				this.removeLayer();
				action.run();
			});
		}
		this.setLayer(menu, anchor, 'menu', 'bottom');
		this.enableMenuKeyboard(menu);
	}

	private runMenuAction(action: TaskMenuAction, task: TGTask, blockReason: string | null): void {
		switch (action) {
			case 'start-timer':
				this.openTimerModal(task, Boolean(!blockReason && this.options.actions));
				break;
			case 'edit':
				this.openEditor(task);
				break;
			case 'postpone-day':
				if (this.options.actions) void this.runMutation(task, () => this.options.actions!.postponeTask(task, 1));
				break;
			case 'postpone-week':
				if (this.options.actions) void this.runMutation(task, () => this.options.actions!.postponeTask(task, 7));
				break;
			case 'set-today':
				if (this.options.actions) void this.runMutation(task, () => this.options.actions!.updateTask(task, { due: getTodayKey() }));
				break;
			case 'set-long-term':
				if (this.options.actions) void this.runMutation(task, () => this.options.actions!.updateTask(task, { goal: true }));
				break;
			case 'show-readonly-reason':
				new Notice(blockReason ?? '这条任务当前为只读，请在源文件中处理');
				break;
			case 'open-source':
				void this.openSource(task);
				break;
			case 'delete':
				this.openDeleteConfirmation(task);
				break;
		}
	}

	private setLayer(
		layer: HTMLElement,
		anchor: HTMLElement,
		kind: 'filter' | 'menu',
		preference: 'bottom' | 'right'
	): void {
		this.removeLayer();
		this.layerEl = layer;
		this.layerAnchor = anchor;
		this.layerKind = kind;
		anchor.setAttr('data-tg-layer-anchor', 'true');
		anchor.setAttr('aria-expanded', 'true');
		const anchorRect = anchor.getBoundingClientRect();
		const layerRect = layer.getBoundingClientRect();
		const position = positionFloatingLayer(anchorRect, layerRect, {
			width: window.innerWidth,
			height: window.innerHeight,
		}, preference);
		layer.style.left = `${position.left}px`;
		layer.style.top = `${position.top}px`;
		layer.setAttr('data-placement', position.placement);
	}

	private enableMenuKeyboard(menu: HTMLElement): void {
		const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'));
		if (items.length === 0) return;
		menu.addEventListener('keydown', (event) => {
			const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
			let next: number | null = null;
			if (event.key === 'ArrowDown') next = (current + 1) % items.length;
			else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
			else if (event.key === 'Home') next = 0;
			else if (event.key === 'End') next = items.length - 1;
			if (next === null) return;
			event.preventDefault();
			items[next].focus();
		});
		const selected = items.find((item) => item.getAttribute('aria-checked') === 'true');
		window.requestAnimationFrame(() => (selected ?? items[0]).focus());
	}

	private removeLayer(): void {
		this.layerAnchor?.removeAttribute('data-tg-layer-anchor');
		this.layerAnchor?.setAttr('aria-expanded', 'false');
		this.layerEl?.remove();
		this.layerEl = null;
		this.layerAnchor = null;
		this.layerKind = null;
	}

	private dismissLayer(restoreFocus: boolean): void {
		if (!this.layerEl) return;
		const anchor = this.layerAnchor;
		const wasFilter = this.layerKind === 'filter';
		this.removeLayer();
		if (wasFilter && this.filterPanelOpen) {
			this.filterPanelOpen = false;
			this.render();
		}
		if (restoreFocus) window.requestAnimationFrame(() => anchor?.focus());
	}

	private schedulePreview(row: HTMLElement, task: TGTask, title: HTMLElement): void {
		if (!isFinePointer() || (task.description.length < 48 && title.scrollHeight <= title.clientHeight + 1)) return;
		this.clearPreviewTimers();
		this.previewTimer = window.setTimeout(() => this.showPreview(row, task), 300);
	}

	private showPreview(anchor: HTMLElement, task: TGTask): void {
		this.closePreview();
		this.previewAnchor = anchor;
		const preview = document.body.createDiv({ cls: `tg-task-preview tg-task-tone-${task.section}`, attr: { role: 'tooltip' } });
		preview.createDiv({ cls: 'tg-task-preview-title', text: taskTitle(task) });
		const meta = preview.createDiv('tg-task-preview-meta');
		meta.createSpan({ cls: `tg-task-status-badge is-${task.status}`, text: statusLabel(task.status, Boolean(task.routine)) });
		if (task.due) meta.createSpan({ text: `到期 ${task.due}` });
		if (task.priority) meta.createSpan({ text: `${priorityGlyph(task.priority)} ${priorityLabel(task.priority)}优先级` });
		const source = preview.createDiv('tg-task-preview-source');
		const sourceIcon = source.createSpan();
		setIcon(sourceIcon, 'file-text');
		source.createSpan({ text: `${task.filePath} · 第 ${task.line + 1} 行` });
		const blockReason = getTaskWriteBlockReason(task);
		if (blockReason) {
			const diagnostic = preview.createDiv('tg-task-preview-diagnostic');
			const icon = diagnostic.createSpan();
			setIcon(icon, 'lock-keyhole');
			diagnostic.createSpan({ text: blockReason });
		}
		preview.addEventListener('mouseenter', () => this.clearPreviewTimers());
		preview.addEventListener('mouseleave', () => this.schedulePreviewClose());
		this.previewEl = preview;
		this.positionPreview(anchor, preview);
	}

	private positionPreview(anchor: HTMLElement, preview: HTMLElement): void {
		const anchorRect = anchor.getBoundingClientRect();
		const previewRect = preview.getBoundingClientRect();
		const position = positionFloatingLayer(anchorRect, previewRect, {
			width: window.innerWidth,
			height: window.innerHeight,
		}, 'right', 10, 8);
		preview.style.left = `${position.left}px`;
		preview.style.top = `${position.top}px`;
		preview.setAttr('data-placement', position.placement);
	}

	private schedulePreviewClose(): void {
		if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
		this.previewTimer = null;
		if (this.previewCloseTimer !== null) window.clearTimeout(this.previewCloseTimer);
		this.previewCloseTimer = window.setTimeout(() => this.closePreview(), 120);
	}

	private clearPreviewTimers(): void {
		if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
		if (this.previewCloseTimer !== null) window.clearTimeout(this.previewCloseTimer);
		this.previewTimer = null;
		this.previewCloseTimer = null;
	}

	private closePreview(): void {
		this.clearPreviewTimers();
		this.previewEl?.remove();
		this.previewEl = null;
		this.previewAnchor = null;
	}

	private async runToggle(task: TGTask): Promise<void> {
		if (!this.options.actions || this.pendingStatuses.has(task.id)) return;
		const next: EditableTaskStatus = task.status === 'done' || task.status === 'cancelled' ? 'todo' : 'done';
		this.pendingStatuses.set(task.id, next);
		this.render();
		await this.options.actions.toggleDone(task);
		this.pendingStatuses.delete(task.id);
		this.render();
	}

	private async runSetStatus(task: TGTask, status: EditableTaskStatus): Promise<void> {
		if (!this.options.actions || this.pendingStatuses.has(task.id) || status === task.status) return;
		this.pendingStatuses.set(task.id, status);
		this.render();
		await this.options.actions.setStatus(task, status);
		this.pendingStatuses.delete(task.id);
		this.render();
	}

	private openEditor(task: TGTask): void {
		if (!this.options.actions) {
			void this.openSource(task);
			return;
		}
		new TaskEditModal(this.app, task, {
			getSettings: this.options.getSettings,
			save: (patch) => this.options.actions!.updateTask(task, patch),
			deleteTask: () => this.runMutation(task, () => this.options.actions!.deleteTask(task)),
			skipRoutine: task.routine ? () => {
				const instance = this.findRoutineInstance(task);
				if (instance && this.options.routineActions) {
					return this.runMutation(task, () => this.options.routineActions!.skipToday(instance));
				}
				return this.runMutation(task, () => this.options.actions!.setStatus(task, 'cancelled'));
			} : undefined,
			openSource: () => this.openSource(task),
		}).open();
	}

	private openTimerModal(task: TGTask, taskWritable: boolean): void {
		const timer = this.options.timer;
		if (!timer || !canStartTimerFromTask(task)) return;
		new TaskTimerModal(this.app, {
			defaultName: taskTimerDefaultName(task),
			taskWritable,
			taskAlreadyInProgress: task.status === 'in-progress',
			getSnapshot: timer.getSnapshot,
			openTimeView: timer.openTimeView,
			getCompletablePreviousName: () => {
				const previous = timer.getLinkedTask();
				if (!previous || previous.filePath === task.filePath && previous.raw === task.raw) return null;
				return canCompleteLinkedTask(previous) ? taskTimerDefaultName(previous) : null;
			},
			start: (name, completePrevious) => {
				// 必须在切换之前取：切换成功后关联会被换成新任务。
				const previous = completePrevious ? timer.getLinkedTask() : null;
				return startTaskTimer(task, name, {
					startTimer: async (activityName) => {
						const result = await timer.start(activityName);
						if (result.ok) timer.linkTask(task);
						return result;
					},
					canUpdateStatus: taskWritable,
					setInProgress: taskWritable && this.options.actions
						? () => this.runMutation(task, () => this.options.actions!.setStatus(task, 'in-progress'))
						: undefined,
					completePrevious: previous && canCompleteLinkedTask(previous)
						? () => timer.completeTask(previous)
						: undefined,
				});
			},
		}).open();
	}

	private openCreateModal(): void {
		if (!this.options.actions) return;
		new TaskCreateModal(this.app, {
			inboxPath: this.options.getSettings().inboxPath,
			create: (description, due) => this.options.actions!.createTask(description, due),
		}).open();
	}

	private openDeleteConfirmation(task: TGTask): void {
		if (!this.options.actions) return;
		new TaskDeleteConfirmModal(this.app, task, {
			confirm: () => this.runMutation(task, () => this.options.actions!.deleteTask(task)),
			openSource: () => this.openSource(task),
		}).open();
	}

	private createIconAction(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void | Promise<unknown>): void {
		const button = parent.createEl('button', { cls: 'tg-task-row-action', attr: { 'aria-label': label, title: label } });
		setIcon(button, icon);
		button.addEventListener('click', (event) => void action(event));
	}

	private async runMutation(task: TGTask, action: () => Promise<WriteResult>): Promise<WriteResult> {
		if (this.pendingTasks.has(task.id)) return { ok: false, reason: 'io-error', message: '任务操作正在进行，请稍候' };
		this.pendingTasks.add(task.id);
		this.render();
		try {
			return await action();
		} finally {
			this.pendingTasks.delete(task.id);
			this.render();
		}
	}

	private isCollapsed(section: TaskSection): boolean {
		if (section === 'overdue' || section === 'today') return false;
		return this.options.getState().collapsed[section] ?? true;
	}

	private async toggleSection(section: TaskSection): Promise<void> {
		if (section === 'overdue' || section === 'today') return;
		const current = this.options.getState();
		const state: TaskPanelState = { collapsed: { ...current.collapsed, [section as PersistedSection]: !this.isCollapsed(section) } };
		await this.options.saveState(state);
		this.render();
	}

	private activeFilterCount(): number {
		return this.filters.statuses.size + this.filters.priorities.size + this.filters.sources.size;
	}

	private findRoutineInstance(task: TGTask): RoutineInstance | undefined {
		return this.options.routineIndex?.getSnapshot().groups
			.flatMap((group) => group.items)
			.find((instance) => instance.task.id === task.id);
	}

	private async openSource(task: TGTask): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { eState: { line: task.line } });
		window.setTimeout(() => {
			if (leaf.view instanceof MarkdownView) {
				leaf.view.editor.setCursor({ line: task.line, ch: 0 });
				leaf.view.editor.scrollIntoView({ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } }, true);
			}
		}, 0);
	}

	private restoreScroll(container: HTMLElement | null, scrollTop: number): void {
		if (!container) return;
		window.requestAnimationFrame(() => { container.scrollTop = scrollTop; });
	}
}

function filterTerminalTasks(tasks: TGTask[], range: TaskSettings['doneRange']): TGTask[] {
	if (range === 'all') return tasks;
	const today = getTodayKey();
	const start = range === 'today' ? today : getTodayKey(offsetDate(new Date(), -6));
	return tasks.filter((task) => {
		const date = terminalDate(task);
		return date !== undefined && date >= start && date <= today;
	});
}

function toggleSetValue<T>(set: Set<T>, value: T): void {
	if (set.has(value)) set.delete(value);
	else set.add(value);
}

function countSection(tasks: TGTask[], section: TaskSection): number {
	return tasks.filter((task) => task.section === section).length;
}

function offsetDate(date: Date, days: number): Date {
	const copy = new Date(date.getTime());
	copy.setDate(copy.getDate() + days);
	return copy;
}

function checkboxIcon(status: TaskStatusKind): string {
	if (status === 'done') return 'square-check-big';
	if (status === 'cancelled') return 'square-x';
	if (status === 'in-progress') return 'square-dashed';
	if (status === 'unknown') return 'square-help';
	return 'square';
}


function taskTitle(task: TGTask): string {
	return task.routine ? displayRoutineTitle(task.description || task.raw.trim()) : (task.description || task.raw.trim());
}

function statusLabel(status: TaskStatusKind, routine = false): string {
	if (routine && status === 'cancelled') return '已跳过';
	return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? '未知';
}

function priorityGlyph(priority: TaskPriority): string {
	return PRIORITY_OPTIONS.find((option) => option.value === priority)?.glyph ?? '';
}

function priorityLabel(priority: TaskPriority): string {
	return PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? '';
}

function formatDue(dateKey: string): string {
	const [, month, day] = dateKey.split('-');
	return `${month}-${day}`;
}

function fileName(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

function isFinePointer(): boolean {
	return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function timerStatusCopy(snapshot: TimerSnapshot): string {
	if (snapshot.status === 'conflict') return snapshot.message ?? '发现多个正在运行的活动';
	if (snapshot.status === 'invalid') return snapshot.message ?? '计时格式异常';
	if (snapshot.status === 'recovery-required') return '需要先处理跨日计时';
	return snapshot.message ?? '计时写入失败';
}

function taskMenuActionConfig(action: TaskMenuAction): { label: string; icon: string; group: string; danger?: boolean } {
	switch (action) {
		case 'start-timer': return { label: '开始计时', icon: 'play', group: 'timer' };
		case 'edit': return { label: '编辑任务', icon: 'pencil', group: 'edit' };
		case 'postpone-day': return { label: '顺延一天', icon: 'calendar-plus', group: 'schedule' };
		case 'postpone-week': return { label: '顺延一周', icon: 'calendar-range', group: 'schedule' };
		case 'set-today': return { label: '设为今天', icon: 'sun', group: 'schedule' };
		case 'set-long-term': return { label: '设为长期', icon: 'mountain', group: 'schedule' };
		case 'show-readonly-reason': return { label: '查看只读原因', icon: 'lock-keyhole', group: 'readonly' };
		case 'open-source': return { label: '打开源文件', icon: 'file-text', group: 'source' };
		case 'delete': return { label: '删除任务', icon: 'trash-2', group: 'danger', danger: true };
	}
}
