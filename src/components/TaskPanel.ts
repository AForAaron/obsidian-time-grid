import { App, MarkdownView, setIcon, TFile } from 'obsidian';
import { TaskPanelState, TaskSection, TaskSettings, TGTask } from '../types/task';
import { TaskIndex } from '../utils/taskIndex';
import { getTodayKey, sortTasks, terminalDate } from '../utils/taskParser';

type PersistedSection = 'goal' | 'future' | 'done';

interface TaskPanelOptions {
	getSettings: () => TaskSettings;
	getState: () => TaskPanelState;
	saveState: (state: TaskPanelState) => Promise<void>;
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
		const row = parent.createDiv(`tg-task-row tg-task-status-${task.status}`);
		if (task.diagnostics.some((item) => item.blocking) || task.hasRecurrence) row.addClass('is-read-only');

		const status = row.createSpan({ cls: 'tg-task-status', attr: { 'aria-hidden': 'true' } });
		status.setText(statusGlyph(task));
		const body = row.createDiv('tg-task-body');
		const description = body.createEl('button', { cls: 'tg-task-description' });
		description.setText(task.description || task.raw.trim());
		description.setAttr('aria-label', `打开源文件：${task.filePath} 第 ${task.line + 1} 行`);
		description.addEventListener('click', () => void this.openSource(task));

		if (this.options.getSettings().showFileName) {
			body.createDiv({ cls: 'tg-task-file', text: fileName(task.filePath) });
		}
		const meta = row.createDiv('tg-task-meta');
		if (task.due) {
			const due = meta.createSpan({ cls: 'tg-task-due', text: `📅 ${task.due.slice(5)}` });
			if (task.section === 'overdue') due.addClass('is-overdue');
		}
		if (task.priority) meta.createSpan({ cls: 'tg-task-priority', text: priorityGlyph(task.priority) });
		if (task.hasRecurrence) {
			meta.createSpan({ cls: 'tg-task-warning', text: '🔁', attr: { title: '循环任务只读' } });
		}
		const diagnostic = task.diagnostics.find((item) => item.blocking);
		if (diagnostic) {
			meta.createSpan({ cls: 'tg-task-warning', text: '⚠', attr: { title: diagnostic.message } });
		}
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

function statusGlyph(task: TGTask): string {
	switch (task.status) {
		case 'todo': return '☐';
		case 'in-progress': return '◐';
		case 'done': return '☑';
		case 'cancelled': return '⊘';
		case 'unknown': return `[${task.statusChar}]`;
	}
}

function priorityGlyph(priority: NonNullable<TGTask['priority']>): string {
	return ({ highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' })[priority];
}

function fileName(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}
