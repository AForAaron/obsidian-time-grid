import { Notice } from 'obsidian';
import {
	RoutineDefinitionPatch,
	RoutineDocument,
	RoutineGroupDefinition,
	RoutineInstance,
	RoutineItemDefinition,
	RoutineWeekday,
} from '../types/routine';
import { WriteResult } from '../types/task';
import { newRoutineId } from './routineFormat';
import { RoutineIndex } from './routineIndex';
import { RoutineRepository } from './routineRepository';
import { TaskWriter } from './taskWriter';

export class RoutineWriter {
	private repository: RoutineRepository;
	private index: RoutineIndex;
	private taskWriter: TaskWriter;
	private markMigrated: () => Promise<void>;

	constructor(
		repository: RoutineRepository,
		index: RoutineIndex,
		taskWriter: TaskWriter,
		markMigrated: () => Promise<void>
	) {
		this.repository = repository;
		this.index = index;
		this.taskWriter = taskWriter;
		this.markMigrated = markMigrated;
	}

	async migrate(): Promise<WriteResult> {
		const result = await this.repository.migrateLegacyTemplate();
		if (!result.ok) return this.fail(result);
		try {
			await this.markMigrated();
		} catch (error) {
			new Notice(`每日流程文件迁移成功，但插件设置保存失败：${String(error)}`, 8000);
		}
		await this.index.rebuild();
		return result;
	}

	async skipToday(instance: RoutineInstance): Promise<WriteResult> {
		const result = await this.taskWriter.setStatus(instance.task, 'cancelled');
		if (result.ok) await this.index.rebuild();
		return result;
	}

	async createGroup(title: string, subtitle?: string): Promise<WriteResult> {
		return this.mutate((document) => {
			document.groups.push({
				id: newRoutineId('group'),
				title: cleanTitle(title, '新流程组合'),
				subtitle: cleanOptional(subtitle),
				enabled: true,
				order: document.groups.length,
				items: [],
			});
		});
	}

	async updateGroup(groupId: string, patch: { title?: string; subtitle?: string; enabled?: boolean }): Promise<WriteResult> {
		return this.mutate((document) => {
			const group = requireGroup(document, groupId);
			if (patch.title !== undefined) group.title = cleanTitle(patch.title, group.title);
			if (patch.subtitle !== undefined) group.subtitle = cleanOptional(patch.subtitle);
			if (patch.enabled !== undefined) group.enabled = patch.enabled;
		});
	}

	async moveGroup(groupId: string, direction: -1 | 1): Promise<WriteResult> {
		return this.mutate((document) => moveById(document.groups, groupId, direction));
	}

	async deleteGroup(groupId: string): Promise<WriteResult> {
		return this.mutate((document) => {
			const index = document.groups.findIndex((group) => group.id === groupId);
			if (index < 0) throw new Error('找不到流程组合');
			document.groups.splice(index, 1);
		});
	}

	async createItem(groupId: string, title: string): Promise<WriteResult> {
		return this.mutate((document) => {
			const group = requireGroup(document, groupId);
			group.items.push({
				id: newRoutineId('item'),
				title: cleanTitle(title, '新流程项目'),
				enabled: true,
				order: group.items.length,
				schedule: { weekdays: allWeekdays() },
			});
		});
	}

	async addTodayInstanceToFuture(instance: RoutineInstance, groupId?: string): Promise<WriteResult> {
		const target = groupId ?? this.index.getSnapshot().definition.groups[0]?.id;
		if (!target) return this.fail({ ok: false, reason: 'read-only-task', message: '请先创建一个流程组合' });
		return this.mutate((document) => {
			const group = requireGroup(document, target);
			group.items.push({
				id: newRoutineId('item'),
				title: cleanTitle(instance.task.description, '新流程项目'),
				enabled: true,
				order: group.items.length,
				priority: instance.task.priority,
				schedule: { weekdays: allWeekdays(), reminderTime: instance.reminderTime },
			});
		});
	}

	async updateItem(
		groupId: string,
		itemId: string,
		patch: RoutineDefinitionPatch,
		applyToday = false,
		targetGroupId = groupId
	): Promise<WriteResult> {
		const result = await this.mutate((document) => {
			const source = requireGroup(document, groupId);
			const item = requireItem(source, itemId);
			if (targetGroupId !== groupId) {
				const target = requireGroup(document, targetGroupId);
				source.items.splice(source.items.indexOf(item), 1);
				item.order = target.items.length;
				target.items.push(item);
			}
			applyItemPatch(item, patch);
		});
		if (!result.ok || !applyToday) return result;
		const refreshed = await this.repository.loadDocument();
		const updated = refreshed.document.groups.flatMap((group) => group.items)
			.find((item) => item.id === itemId);
		if (!updated) return result;
		const instance = this.index.getSnapshot().groups.flatMap((group) => group.items)
			.find((candidate) => candidate.itemId === itemId);
		if (!instance) return result;
		const taskResult = await this.taskWriter.updateTask(instance.task, {
			description: updated.title,
			priority: updated.priority ?? null,
			routineReminderTime: updated.schedule.reminderTime ?? null,
			routineGroupId: targetGroupId,
		});
		await this.index.rebuild();
		return taskResult;
	}

	async moveItem(groupId: string, itemId: string, direction: -1 | 1): Promise<WriteResult> {
		return this.mutate((document) => moveById(requireGroup(document, groupId).items, itemId, direction));
	}

	async moveItemToGroup(sourceGroupId: string, itemId: string, targetGroupId: string): Promise<WriteResult> {
		return this.mutate((document) => {
			const source = requireGroup(document, sourceGroupId);
			const target = requireGroup(document, targetGroupId);
			const index = source.items.findIndex((item) => item.id === itemId);
			if (index < 0) throw new Error('找不到流程项目');
			const [item] = source.items.splice(index, 1);
			target.items.push({ ...item, order: target.items.length });
		});
	}

	async deleteItem(groupId: string, itemId: string): Promise<WriteResult> {
		return this.mutate((document) => {
			const group = requireGroup(document, groupId);
			const index = group.items.findIndex((item) => item.id === itemId);
			if (index < 0) throw new Error('找不到流程项目');
			group.items.splice(index, 1);
		});
	}

	private async mutate(mutator: (document: RoutineDocument) => void): Promise<WriteResult> {
		const load = await this.repository.loadDocument();
		if (!load.ready) return this.fail({ ok: false, reason: 'read-only-task', message: load.diagnostics.join('；') });
		const document = cloneDocument(load.document);
		try {
			mutator(document);
			normalizeOrders(document);
		} catch (error) {
			return this.fail({ ok: false, reason: 'read-only-task', message: String(error) });
		}
		const result = await this.repository.saveDocument(document, load.document);
		if (!result.ok) return this.fail(result);
		await this.index.rebuild();
		return result;
	}

	private fail(result: Extract<WriteResult, { ok: false }>): WriteResult {
		new Notice(result.message, 8000);
		return result;
	}
}

function applyItemPatch(item: RoutineItemDefinition, patch: RoutineDefinitionPatch): void {
	if (patch.title !== undefined) item.title = cleanTitle(patch.title, item.title);
	if (patch.enabled !== undefined) item.enabled = patch.enabled;
	if (patch.clearPriority) item.priority = undefined;
	else if (patch.priority !== undefined) item.priority = patch.priority;
	if (patch.weekdays !== undefined) {
		const weekdays = [...new Set(patch.weekdays)].sort((a, b) => a - b) as RoutineWeekday[];
		if (weekdays.length === 0) throw new Error('至少选择一个星期');
		item.schedule.weekdays = weekdays;
	}
	if (patch.activeFrom !== undefined) item.schedule.activeFrom = patch.activeFrom || undefined;
	if (patch.activeUntil !== undefined) item.schedule.activeUntil = patch.activeUntil || undefined;
	if (patch.reminderTime !== undefined) item.schedule.reminderTime = patch.reminderTime || undefined;
	if (item.schedule.activeFrom && item.schedule.activeUntil && item.schedule.activeFrom > item.schedule.activeUntil) {
		throw new Error('生效日期不能晚于结束日期');
	}
}

function requireGroup(document: RoutineDocument, groupId: string): RoutineGroupDefinition {
	const group = document.groups.find((candidate) => candidate.id === groupId);
	if (!group) throw new Error('找不到流程组合');
	return group;
}

function requireItem(group: RoutineGroupDefinition, itemId: string): RoutineItemDefinition {
	const item = group.items.find((candidate) => candidate.id === itemId);
	if (!item) throw new Error('找不到流程项目');
	return item;
}

function moveById<T extends { id: string; order: number }>(items: T[], id: string, direction: -1 | 1): void {
	items.sort((a, b) => a.order - b.order);
	const index = items.findIndex((item) => item.id === id);
	const target = index + direction;
	if (index < 0) throw new Error('找不到要移动的项目');
	if (target < 0 || target >= items.length) return;
	[items[index], items[target]] = [items[target], items[index]];
	items.forEach((item, order) => { item.order = order; });
}

function normalizeOrders(document: RoutineDocument): void {
	document.groups.sort((a, b) => a.order - b.order).forEach((group, groupOrder) => {
		group.order = groupOrder;
		group.items.sort((a, b) => a.order - b.order).forEach((item, itemOrder) => { item.order = itemOrder; });
	});
}

function cloneDocument(document: RoutineDocument): RoutineDocument {
	return {
		version: 1,
		groups: document.groups.map((group) => ({
			...group,
			items: group.items.map(cloneItem),
		})),
	};
}

function cloneItem(item: RoutineItemDefinition): RoutineItemDefinition {
	return { ...item, schedule: { ...item.schedule, weekdays: [...item.schedule.weekdays] } };
}

function cleanTitle(value: string, fallback: string): string {
	return value.replace(/[\r\n]+/g, ' ').trim() || fallback;
}

function cleanOptional(value: string | undefined): string | undefined {
	return value?.replace(/[\r\n]+/g, ' ').trim() || undefined;
}

function allWeekdays(): RoutineWeekday[] {
	return [1, 2, 3, 4, 5, 6, 7];
}
