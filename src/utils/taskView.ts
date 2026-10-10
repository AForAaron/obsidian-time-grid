import { TaskPriority, TaskSection, TaskStatusKind, TGTask } from '../types/task';

export type TaskPriorityFilter = TaskPriority | 'none';

/** 顶部快捷范围：全部 / 每日（流程） / 今日（今日到期） / 逾期 */
export type TaskQuickScope = 'all' | 'overdue' | 'today' | 'daily';

export interface TaskFilterState {
	query: string;
	/** 统计格与 chips 共用的快捷范围 */
	quickScope: TaskQuickScope;
	statuses: Set<TaskStatusKind>;
	priorities: Set<TaskPriorityFilter>;
	sources: Set<string>;
}

export interface TaskFilterCounts {
	filtered: Partial<Record<TaskSection, number>>;
	total: Partial<Record<TaskSection, number>>;
}

export type FutureTaskGroup = 'tomorrow' | 'next7' | 'later';

export function createEmptyTaskFilters(): TaskFilterState {
	return { query: '', quickScope: 'all', statuses: new Set(), priorities: new Set(), sources: new Set() };
}

export function countAdvancedTaskFilters(filters: TaskFilterState): number {
	return filters.statuses.size + filters.priorities.size + filters.sources.size;
}

export function hasActiveTaskFilters(filters: TaskFilterState): boolean {
	return filters.query.trim().length > 0
		|| filters.quickScope !== 'all'
		|| countAdvancedTaskFilters(filters) > 0;
}

export function filterTasks(tasks: TGTask[], filters: TaskFilterState): TGTask[] {
	const query = filters.query.trim().toLocaleLowerCase();
	return tasks.filter((task) => {
		if (filters.quickScope === 'overdue' && task.section !== 'overdue') return false;
		if (filters.quickScope === 'today' && task.section !== 'today' && !task.alsoToday) return false;
		if (filters.quickScope === 'daily' && !task.routine) return false;
		if (query) {
			const searchable = `${task.description}\n${task.tags.join(' ')}\n${task.filePath}`.toLocaleLowerCase();
			if (!searchable.includes(query)) return false;
		}
		if (filters.statuses.size > 0 && !filters.statuses.has(task.status)) return false;
		const priority: TaskPriorityFilter = task.priority ?? 'none';
		if (filters.priorities.size > 0 && !filters.priorities.has(priority)) return false;
		if (filters.sources.size > 0 && !filters.sources.has(task.filePath)) return false;
		return true;
	});
}

export function countFilteredSections(allTasks: TGTask[], filteredTasks: TGTask[]): TaskFilterCounts {
	const result: TaskFilterCounts = { filtered: {}, total: {} };
	for (const task of allTasks) result.total[task.section] = (result.total[task.section] ?? 0) + 1;
	for (const task of filteredTasks) result.filtered[task.section] = (result.filtered[task.section] ?? 0) + 1;
	return result;
}

export function groupFutureTasks(tasks: TGTask[], todayKey: string): Record<FutureTaskGroup, TGTask[]> {
	const tomorrow = shiftDateKey(todayKey, 1);
	const seventhDay = shiftDateKey(todayKey, 7);
	return {
		tomorrow: tasks.filter((task) => task.due === tomorrow),
		next7: tasks.filter((task) => Boolean(task.due && task.due > tomorrow && task.due <= seventhDay)),
		later: tasks.filter((task) => Boolean(task.due && task.due > seventhDay)),
	};
}

function shiftDateKey(dateKey: string, days: number): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
