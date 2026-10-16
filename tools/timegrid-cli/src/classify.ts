/**
 * 把任务分到两列：
 *   - today: section === 'today'（不过滤优先级——今天该做的都得看）
 *   - overdue: section === 'overdue' 且带 priority
 *     （逾期太多时只看重要的，无优先级的过期任务默认不再显示）
 *
 * 排序与插件任务面板的 `sortTasks` 保持一致：
 *   - today 列：优先级降序 → 到期日**升序**（最快到期的排最前）
 *   - overdue 列：优先级降序 → 到期日**降序**（最近逾期的排最前）
 */

import type { TGTask, TaskPriority } from '@timegrid/task-types';

export interface TwoColumns {
	today: TGTask[];
	overdue: TGTask[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
	highest: 5,
	high: 4,
	medium: 3,
	low: 2,
	lowest: 1,
};

export function classify(tasks: TGTask[]): TwoColumns {
	const today: TGTask[] = [];
	const overdue: TGTask[] = [];

	for (const t of tasks) {
		if (t.status === 'done' || t.status === 'cancelled') continue;
		if (t.section === 'today') {
			today.push(t);
		} else if (t.section === 'overdue' && t.priority) {
			overdue.push(t);
		}
	}

	return {
		today: sortByPriorityThenDue(today, 'asc'),
		overdue: sortByPriorityThenDue(overdue, 'desc'),
	};
}

/**
 * 优先级降序优先；同优先级内按到期日排序，方向由 `direction` 决定。
 * 与插件 `src/utils/taskParser.ts` 的 sortTasks 同源语义，改一处请同步另一处。
 */
export function sortByPriorityThenDue(tasks: TGTask[], direction: 'asc' | 'desc'): TGTask[] {
	return [...tasks].sort((a, b) => {
		// 有优先级的排前面（同 section 内）
		const ap = a.priority ? PRIORITY_RANK[a.priority] : 0;
		const bp = b.priority ? PRIORITY_RANK[b.priority] : 0;
		if (ap !== bp) return bp - ap;
		const byDue = (a.due ?? '').localeCompare(b.due ?? '');
		return direction === 'asc' ? byDue : -byDue;
	});
}

