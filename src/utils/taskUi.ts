import { TaskPriority, TGTask } from '../types/task';
import { canStartTimerFromTask } from './taskTimer';

export type FloatingPreference = 'bottom' | 'right';
export type FloatingPlacement = 'bottom' | 'top' | 'right' | 'left';

export interface RectLike {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export interface SizeLike {
	width: number;
	height: number;
}

export interface ViewportLike {
	width: number;
	height: number;
}

export interface FloatingPosition {
	left: number;
	top: number;
	placement: FloatingPlacement;
}

export type TaskMenuAction =
	| 'start-timer'
	| 'edit'
	| 'postpone-day'
	| 'postpone-week'
	| 'set-today'
	| 'set-long-term'
	| 'set-priority'
	| 'show-readonly-reason'
	| 'open-source'
	| 'delete';

export type PriorityCode = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

/** 全站唯一：P 码展示 ↔ 内部值 ↔ 中文名（落盘仍用 Tasks emoji） */
export const PRIORITY_CHOICES: Array<{ value: TaskPriority | ''; code: string; name: string; levelClass: string }> = [
	{ value: '', code: '－', name: '无', levelClass: 'is-p-none' },
	{ value: 'highest', code: 'P1', name: '最高', levelClass: 'is-p1' },
	{ value: 'high', code: 'P2', name: '高', levelClass: 'is-p2' },
	{ value: 'medium', code: 'P3', name: '中', levelClass: 'is-p3' },
	{ value: 'low', code: 'P4', name: '低', levelClass: 'is-p4' },
	{ value: 'lowest', code: 'P5', name: '最低', levelClass: 'is-p5' },
];

export function priorityCode(priority: TaskPriority): PriorityCode {
	const map: Record<TaskPriority, PriorityCode> = {
		highest: 'P1',
		high: 'P2',
		medium: 'P3',
		low: 'P4',
		lowest: 'P5',
	};
	return map[priority];
}

export function priorityLevelClass(priority: TaskPriority | ''): string {
	return PRIORITY_CHOICES.find((choice) => choice.value === priority)?.levelClass ?? 'is-p-none';
}

export function priorityName(priority: TaskPriority): string {
	return PRIORITY_CHOICES.find((choice) => choice.value === priority)?.name ?? '';
}

export function priorityAriaLabel(priority: TaskPriority): string {
	return `${priorityCode(priority)} · ${priorityName(priority)}`;
}

/** 卡片徽章 / 菜单项：写入分色 P 码节点 */
export function appendPriorityCode(parent: HTMLElement, priority: TaskPriority | ''): HTMLSpanElement {
	return parent.createSpan({
		cls: `tg-priority-code ${priorityLevelClass(priority)}`,
		text: priority ? priorityCode(priority) : '－',
	});
}

/** 菜单行：彩码 + 中性中文名 */
export function appendPriorityMenuLabel(parent: HTMLElement, priority: TaskPriority | ''): void {
	appendPriorityCode(parent, priority);
	parent.createSpan({
		cls: 'tg-priority-name',
		text: priority ? priorityName(priority) : '无',
	});
}

export function positionFloatingLayer(
	anchor: RectLike,
	layer: SizeLike,
	viewport: ViewportLike,
	preference: FloatingPreference,
	margin = 10,
	gap = 6
): FloatingPosition {
	const candidates: Array<{ placement: FloatingPlacement; left: number; top: number }> = preference === 'right'
		? [
			{ placement: 'right', left: anchor.right + gap, top: anchor.top },
			{ placement: 'left', left: anchor.left - layer.width - gap, top: anchor.top },
			{ placement: 'bottom', left: anchor.left, top: anchor.bottom + gap },
			{ placement: 'top', left: anchor.left, top: anchor.top - layer.height - gap },
		]
		: [
			{ placement: 'bottom', left: anchor.left, top: anchor.bottom + gap },
			{ placement: 'top', left: anchor.left, top: anchor.top - layer.height - gap },
			{ placement: 'right', left: anchor.right + gap, top: anchor.top },
			{ placement: 'left', left: anchor.left - layer.width - gap, top: anchor.top },
		];
	const maxLeft = Math.max(margin, viewport.width - layer.width - margin);
	const maxTop = Math.max(margin, viewport.height - layer.height - margin);
	const fits = (candidate: typeof candidates[number]) => {
		switch (candidate.placement) {
			case 'right': return candidate.left + layer.width <= viewport.width - margin;
			case 'left': return candidate.left >= margin;
			case 'bottom': return candidate.top + layer.height <= viewport.height - margin;
			case 'top': return candidate.top >= margin;
		}
	};
	const selected = candidates.find(fits) ?? candidates[0];
	return {
		left: Math.round(clamp(selected.left, margin, maxLeft)),
		top: Math.round(clamp(selected.top, margin, maxTop)),
		placement: selected.placement,
	};
}

export function getTaskMenuActions(task: TGTask, writable: boolean, timerAvailable = false): TaskMenuAction[] {
	const actions: TaskMenuAction[] = [];
	if (timerAvailable && canStartTimerFromTask(task)) actions.push('start-timer');
	if (!writable) return actions.concat('show-readonly-reason', 'open-source');
	actions.push('edit');
	if (task.due) actions.push('postpone-day', 'postpone-week');
	else if (task.section === 'unsorted') actions.push('set-today', 'set-long-term');
	actions.push('set-priority', 'open-source', 'delete');
	return actions;
}

export function getRoutineProgress(
	group: { items: Array<{ id?: string; title?: string; done?: boolean; task?: TGTask }>; id?: string; title?: string } | undefined
): { completed: number; total: number } | null {
	if (!group || group.items.length === 0) return null;
	return {
		completed: group.items.filter((item) => item.done === true || item.task?.status === 'done').length,
		total: group.items.length,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
