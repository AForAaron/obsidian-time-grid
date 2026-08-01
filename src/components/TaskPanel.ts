import { App, MarkdownView, setIcon, TFile } from 'obsidian';
import {
	EditableTaskStatus,
	TaskPatch,
	TaskPanelState,
	TaskSection,
	TaskSettings,
	TaskStatusKind,
	TGTask,
	WriteResult,
} from '../types/task';
import { TaskEditModal } from './TaskEditModal';
import { TaskIndex } from '../utils/taskIndex';
import { getTodayKey, sortTasks, terminalDate } from '../utils/taskParser';
import { getTaskWriteBlockReason } from '../utils/taskWriter';

type PersistedSection = 'goal' | 'future' | 'done';

interface TaskPanelOptions {
	getSettings: () => TaskSettings;
	getState: () => TaskPanelState;
	saveState: (state: TaskPanelState) => Promise<void>;
	actions?: {
		toggleDone: (task: TGTask) => Promise<WriteResult>;
		setStatus: (task: TGTask, status: EditableTaskStatus) => Promise<WriteResult>;
		updateTask: (task: TGTask, patch: TaskPatch) => Promise<WriteResult>;
	};
}

const SECTION_CONFIG: Array<{ section: TaskSection; icon: string; label: string }> = [
	{ section: 'overdue', icon: '🔴', label: '逾期' },
	{ section: 'today', icon: '📅', label: '今天' },
	{ section: 'unsorted', icon: '❓', label: '待分类' },
	{ section: 'goal', icon: '🎯', label: '长期' },
	{ section: 'future', icon: '🔮', label: '未来' },
	{ section: 'done', icon: '✅', label: '已完成' },
];

export class TaskPanel {
	private container: HTMLElement;
	private app: App;
	private index: TaskIndex;
	private options: TaskPanelOptions;
	private unsubscribe: (() => void) | null = null;
	private sessionCollapsed: Partial<Record<TaskSection, boolean>> = {
		overdue: false,
		today: false,
		unsorted: false,
	};
	private expandedSections = new Set<TaskSection>();
	private pendingStatuses = new Map<string, EditableTaskStatus>();

	constructor(parent: HTMLElement, app: App, index: TaskIndex, options: TaskPanelOptions) {
		this.container = parent.createDiv('tg-module tg-task-panel');
		this.app = app;
		this.index = index;
		this.options = options;
		this.unsubscribe = this.index.onChange(() => this.render());
		this.render();
	}

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.container.remove();
	}

	render(): void {
		const outerScroll = this.container.closest('.tg-container') as HTMLElement | null;
		const previousScrollTop = outerScroll?.scrollTop ?? 0;
		const settings = this.options.getSettings();
		this.container.toggleClass('is-hidden', !settings.enabled);
		if (!settings.enabled) {
			this.container.empty();
			return;
		}

		const snapshot = this.index.getSnapshot();
		this.container.empty();
		this.renderHeader(snapshot.tasks);
		if (snapshot.isIndexing) {
			this.container.createDiv({ cls: 'tg-task-empty', text: '正在建立任务索引...' });
			this.restoreScroll(outerScroll, previousScrollTop);
			return;
		}
		if (snapshot.tasks.length === 0) {
			const empty = this.container.createDiv('tg-task-empty');
			empty.appendText('还没有任务。在任意笔记里写 ');
			empty.createEl('code', { text: '- [ ] 内容' });
			empty.appendText(' 即可。');
			this.restoreScroll(outerScroll, previousScrollTop);
			return;
		}

		const totalOverRenderThreshold = snapshot.tasks.length > 200;
		for (const config of SECTION_CONFIG) {
			let tasks = sortTasks(config.section, snapshot.tasks.filter((task) => task.section === config.section));
			if (config.section === 'done') tasks = filterTerminalTasks(tasks, settings.doneRange);
			if (tasks.length === 0) continue;
			this.renderSection(config, tasks, totalOverRenderThreshold, settings.renderLimit);
		}
		this.restoreScroll(outerScroll, previousScrollTop);
	}

	private renderHeader(tasks: TGTask[]): void {
		const header = this.container.createDiv('tg-task-header');
		const summary = header.createDiv('tg-task-summary');
		const active = tasks.filter((task) => task.section !== 'done');
		summary.setText(
			`共 ${tasks.length} 条 · 逾期 ${countSection(tasks, 'overdue')} · 今天 ${countSection(tasks, 'today')} · 待分类 ${countSection(tasks, 'unsorted')} · 活跃 ${active.length}`
		);
		const refresh = header.createEl('button', { cls: 'tg-task-icon-button', attr: { 'aria-label': '重新索引任务' } });
		setIcon(refresh, 'refresh-cw');
		refresh.addEventListener('click', () => void this.index.rebuild());
	}

	private renderSection(
		config: { section: TaskSection; icon: string; label: string },
		tasks: TGTask[],
		limitEnabled: boolean,
		renderLimit: number
	): void {
		const sectionEl = this.container.createDiv(`tg-task-section tg-task-section-${config.section}`);
		const collapsed = this.isCollapsed(config.section);
		const heading = sectionEl.createEl('button', {
			cls: 'tg-task-section-heading',
			attr: { 'aria-expanded': String(!collapsed) },
		});
		heading.createSpan({ cls: 'tg-task-section-title', text: `${config.icon} ${config.label} (${tasks.length})` });
		const chevron = heading.createSpan('tg-task-chevron');
		setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
		heading.addEventListener('click', () => void this.toggleSection(config.section));
		if (collapsed) return;

		const list = sectionEl.createDiv('tg-task-list');
		const shouldLimit = limitEnabled && !this.expandedSections.has(config.section) && tasks.length > renderLimit;
		const visible = shouldLimit ? tasks.slice(0, renderLimit) : tasks;
		for (const task of visible) this.renderTaskRow(list, task);
		if (shouldLimit) {
			const more = sectionEl.createEl('button', {
				cls: 'tg-task-more',
				text: `还有 ${tasks.length - visible.length} 条，点击展开`,
			});
			more.addEventListener('click', () => {
				this.expandedSections.add(config.section);
				this.render();
			});
		}
	}

	private renderTaskRow(parent: HTMLElement, task: TGTask): void {
		const optimisticStatus = this.pendingStatuses.get(task.id);
		const displayStatus: TaskStatusKind = optimisticStatus ?? task.status;
		const blockReason = getTaskWriteBlockReason(task);
		const row = parent.createDiv(`tg-task-row tg-task-status-${displayStatus}`);
		if (blockReason) row.addClass('is-read-only');
		if (optimisticStatus) row.addClass('is-pending');

		const status = row.createEl('button', {
			cls: 'tg-task-status',
			attr: {
				'aria-label': `${displayStatus === 'done' || displayStatus === 'cancelled' ? '重新打开任务' : '完成任务'} ${task.description || task.raw.trim()}`,
				title: blockReason ?? '点击完成或重新打开',
			},
		});
		status.setText(statusGlyph(displayStatus, task.statusChar));
		status.disabled = Boolean(blockReason || optimisticStatus || !this.options.actions);
		status.addEventListener('click', () => void this.runToggle(task));
		const body = row.createDiv('tg-task-body');
		const description = body.createEl('button', { cls: 'tg-task-description' });
		description.setText(task.description || task.raw.trim());
		description.setAttr('aria-label', `编辑任务 ${task.description || task.raw.trim()}`);
		description.setAttr('title', blockReason ?? '点击编辑；⌘/Ctrl 点击打开源文件');
		description.addEventListener('click', (event) => {
			if (event.metaKey || event.ctrlKey) void this.openSource(task);
			else this.openEditor(task);
		});

		if (this.options.getSettings().showFileName) {
			body.createDiv({ cls: 'tg-task-file', text: fileName(task.filePath) });
		}
		const meta = row.createDiv('tg-task-meta');
		if (task.due) {
			const due = meta.createSpan({ cls: 'tg-task-due', text: `📅 ${task.due.slice(5)}` });
			if (task.section === 'overdue') due.addClass('is-overdue');
		}
		if (task.priority) meta.createSpan({ cls: 'tg-task-priority', text: priorityGlyph(task.priority) });
		if (this.options.actions) {
			const select = meta.createEl('select', {
				cls: 'tg-task-status-select',
				attr: { 'aria-label': `设置任务状态：${task.description || task.raw.trim()}`, title: blockReason ?? '设置任务状态' },
			});
			for (const [value, label] of [
				['todo', '待办'],
				['in-progress', '进行中'],
				['done', '完成'],
				['cancelled', '取消'],
			] as Array<[EditableTaskStatus, string]>) {
				select.createEl('option', { value, text: label });
			}
			select.value = displayStatus === 'unknown' ? 'todo' : displayStatus;
			select.disabled = Boolean(blockReason || optimisticStatus);
			select.addEventListener('change', () => void this.runSetStatus(task, select.value as EditableTaskStatus));
		}
		if (task.hasRecurrence) {
			meta.createSpan({ cls: 'tg-task-warning', text: '🔁', attr: { title: '循环任务只读' } });
		}
		const diagnostic = task.diagnostics.find((item) => item.blocking);
		if (diagnostic) {
			meta.createSpan({ cls: 'tg-task-warning', text: '⚠', attr: { title: diagnostic.message } });
		}
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
			openSource: () => this.openSource(task),
		}).open();
	}

	private isCollapsed(section: TaskSection): boolean {
		if (section === 'overdue' || section === 'today' || section === 'unsorted') {
			return this.sessionCollapsed[section] ?? false;
		}
		return this.options.getState().collapsed[section] ?? false;
	}

	private async toggleSection(section: TaskSection): Promise<void> {
		const next = !this.isCollapsed(section);
		if (section === 'overdue' || section === 'today' || section === 'unsorted') {
			this.sessionCollapsed[section] = next;
		} else {
			const state = this.options.getState();
			state.collapsed[section as PersistedSection] = next;
			await this.options.saveState(state);
		}
		this.render();
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

function countSection(tasks: TGTask[], section: TaskSection): number {
	return tasks.filter((task) => task.section === section).length;
}

function offsetDate(date: Date, days: number): Date {
	const copy = new Date(date.getTime());
	copy.setDate(copy.getDate() + days);
	return copy;
}

function statusGlyph(status: TaskStatusKind, originalChar: string): string {
	switch (status) {
		case 'todo': return '☐';
		case 'in-progress': return '◐';
		case 'done': return '☑';
		case 'cancelled': return '⊘';
		case 'unknown': return `[${originalChar}]`;
	}
}

function priorityGlyph(priority: NonNullable<TGTask['priority']>): string {
	return ({ highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' })[priority];
}

function fileName(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}
