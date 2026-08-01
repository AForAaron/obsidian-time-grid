import { App, MarkdownView, Notice, setIcon, TFile } from 'obsidian';
import {
	EditableTaskStatus,
	RoutineGroupViewModel,
	TaskPatch,
	TaskPanelState,
	TaskPriority,
	TaskSection,
	TaskSettings,
	TaskStatusKind,
	TGTask,
	WriteResult,
} from '../types/task';
import { TaskEditModal } from './TaskEditModal';
import { TaskDeleteConfirmModal } from './TaskDeleteConfirmModal';
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

type PersistedSection = 'unsorted' | 'goal' | 'future' | 'done';

interface TaskPanelOptions {
	getSettings: () => TaskSettings;
	getState: () => TaskPanelState;
	saveState: (state: TaskPanelState) => Promise<void>;
	getRoutineGroup?: () => RoutineGroupViewModel | undefined;
	actions?: {
		toggleDone: (task: TGTask) => Promise<WriteResult>;
		setStatus: (task: TGTask, status: EditableTaskStatus) => Promise<WriteResult>;
		updateTask: (task: TGTask, patch: TaskPatch) => Promise<WriteResult>;
		postponeTask: (task: TGTask, days: number) => Promise<WriteResult>;
		deleteTask: (task: TGTask) => Promise<WriteResult>;
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
	private expandedSections = new Set<TaskSection>();
	private expandedTasks = new Set<string>();
	private pendingStatuses = new Map<string, EditableTaskStatus>();
	private pendingTasks = new Set<string>();
	private filters: TaskFilterState = createEmptyTaskFilters();
	private filterPanelOpen = false;
	private routineExpanded = true;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;
	private previewCloseTimer: number | null = null;
	private previewAnchor: HTMLElement | null = null;
	private layerEl: HTMLElement | null = null;
	private layerAnchor: HTMLElement | null = null;
	private layerKind: 'filter' | 'menu' | null = null;
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
		if (!settings.enabled) return;

		const snapshot = this.index.getSnapshot();
		const allTasks = snapshot.tasks;
		this.renderHeader(allTasks, snapshot.isIndexing);
		if (snapshot.isIndexing && allTasks.length === 0) {
			this.renderLoading();
			this.restoreScroll(outerScroll, previousScrollTop);
			return;
		}

		const displayBase = allTasks.filter((task) => task.section !== 'done')
			.concat(filterTerminalTasks(allTasks.filter((task) => task.section === 'done'), settings.doneRange));
		const filteredTasks = filterTasks(displayBase, this.filters);
		const counts = countFilteredSections(displayBase, filteredTasks);
		const filtering = hasActiveTaskFilters(this.filters);

		if (allTasks.length === 0) this.renderEmpty('还没有任务', '在任意笔记里写 “- [ ] 内容” 即可被 Time Grid 汇总。', 'list-plus');
		else if (filteredTasks.length === 0) this.renderEmpty('没有匹配的任务', '换个关键词，或清除筛选条件后再试。', 'search-x', true);

		const totalOverRenderThreshold = displayBase.length > 200;
		for (const config of SECTION_CONFIG) {
			const sectionTasks = sortTasks(config.section, filteredTasks.filter((task) => task.section === config.section));
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
		const refresh = heading.createEl('button', {
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
		const routineGroup = config.section === 'today' ? this.options.getRoutineGroup?.() : undefined;
		if (collapsed || (tasks.length === 0 && !getRoutineProgress(routineGroup))) return;

		const list = sectionEl.createDiv({ cls: 'tg-task-list', attr: { id: `tg-task-list-${config.section}` } });
		if (config.section === 'today' && routineGroup) this.renderRoutineGroup(list, routineGroup);
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

	private renderRoutineGroup(parent: HTMLElement, group: RoutineGroupViewModel): void {
		const progress = getRoutineProgress(group);
		if (!progress) return;
		const wrapper = parent.createDiv('tg-routine-group');
		const summary = wrapper.createEl('button', {
			cls: 'tg-routine-summary',
			attr: { 'aria-expanded': String(this.routineExpanded), 'aria-controls': `tg-routine-items-${group.id}` },
		});
		const icon = summary.createSpan('tg-routine-icon');
		setIcon(icon, 'refresh-cw');
		const copy = summary.createSpan('tg-routine-copy');
		copy.createSpan({ cls: 'tg-routine-title', text: group.title });
		copy.createSpan({ cls: 'tg-routine-subtitle', text: group.subtitle ?? '今天的固定例行事项' });
		summary.createSpan({ cls: 'tg-routine-progress', text: `${progress.completed} / ${progress.total}` });
		const chevron = summary.createSpan('tg-routine-chevron');
		setIcon(chevron, this.routineExpanded ? 'chevron-down' : 'chevron-right');
		summary.addEventListener('click', () => {
			this.routineExpanded = !this.routineExpanded;
			this.render();
		});
		if (!this.routineExpanded) return;
		const items = wrapper.createDiv({ cls: 'tg-routine-items', attr: { id: `tg-routine-items-${group.id}` } });
		for (const item of group.items) {
			const row = items.createDiv(`tg-routine-item${item.done ? ' is-done' : ''}`);
			const check = row.createSpan('tg-routine-check');
			setIcon(check, item.done ? 'check' : 'minus');
			row.createSpan({ cls: 'tg-routine-item-title', text: item.title });
		}
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
		const row = parent.createDiv(`tg-task-row tg-task-status-${displayStatus} tg-task-tone-${task.section}`);
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
			text: task.description || task.raw.trim(),
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
			cls: `tg-task-status-badge is-${displayStatus}`,
			text: statusLabel(displayStatus),
			attr: { 'aria-label': `任务状态：${statusLabel(displayStatus)}，点击更改`, 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
		});
		statusButton.disabled = Boolean(blockReason || mutationPending || !this.options.actions);
		statusButton.addEventListener('click', (event) => this.openStatusMenu(event, statusButton, task));
		if (task.priority) meta.createSpan({ cls: `tg-task-priority is-${task.priority}`, text: `${priorityGlyph(task.priority)} ${priorityLabel(task.priority)}` });
		if (this.options.getSettings().showFileName) meta.createSpan({ cls: 'tg-task-file', text: fileName(task.filePath), attr: { title: task.filePath } });
		if (task.hasRecurrence) meta.createSpan({ cls: 'tg-task-readonly-badge', text: '循环 · 只读' });
		else if (blockReason) meta.createSpan({ cls: 'tg-task-readonly-badge', text: '只读' });

		const more = main.createEl('button', { cls: 'tg-task-more-button', attr: { 'aria-label': '更多任务操作', 'aria-haspopup': 'menu', 'aria-expanded': 'false' } });
		setIcon(more, 'ellipsis');
		more.addEventListener('click', (event) => this.openMoreMenu(event, more, task, blockReason));

		if (!blockReason && this.options.actions) {
			const hoverActions = row.createDiv('tg-task-hover-actions');
			this.createIconAction(hoverActions, 'pencil', '编辑任务', () => this.openEditor(task));
			if (task.due) this.createIconAction(hoverActions, 'calendar-plus', '顺延一天；按住 Shift 顺延一周', (event) =>
				this.runMutation(task, () => this.options.actions!.postponeTask(task, event.shiftKey ? 7 : 1)));
		}

		if (expanded) {
			const details = row.createDiv('tg-task-inline-expanded');
			details.createDiv({ cls: 'tg-task-inline-title', text: task.description || task.raw.trim() });
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
			item.createSpan({ cls: 'tg-task-menu-label', text: option.label });
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
		const writable = Boolean(!blockReason && this.options.actions);
		const actions = getTaskMenuActions(task, writable);
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
			item.createSpan({ cls: 'tg-task-menu-label', text: config.label });
			item.addEventListener('click', () => {
				this.removeLayer();
				this.runMenuAction(action, task, blockReason);
			});
		}
		this.setLayer(menu, anchor, 'menu', 'bottom');
		this.enableMenuKeyboard(menu);
	}

	private runMenuAction(action: TaskMenuAction, task: TGTask, blockReason: string | null): void {
		switch (action) {
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
		preview.createDiv({ cls: 'tg-task-preview-title', text: task.description || task.raw.trim() });
		const meta = preview.createDiv('tg-task-preview-meta');
		meta.createSpan({ cls: `tg-task-status-badge is-${task.status}`, text: statusLabel(task.status) });
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
			openSource: () => this.openSource(task),
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

function statusLabel(status: TaskStatusKind): string {
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

function taskMenuActionConfig(action: TaskMenuAction): { label: string; icon: string; group: string; danger?: boolean } {
	switch (action) {
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
