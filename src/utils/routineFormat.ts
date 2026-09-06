import {
	EMPTY_ROUTINE_DOCUMENT,
	RoutineDiagnostic,
	RoutineDocument,
	RoutineGroupDefinition,
	RoutineGroupViewModel,
	RoutineInstance,
	RoutineItemDefinition,
	RoutineWeekday,
} from '../types/routine';
import { TaskPriority, TaskStatusKind, TGTask } from '../types/task';
import { parseTaskLine } from './taskParser';
import {
	displayRoutineTitle,
	normalizeTime,
	parseHtmlAttributes,
	parseRoutineTaskMarker,
	priorityMarker,
	ROUTINE_ITEM_INSTANCE_PREFIX,
	serializeHtmlAttributes,
	serializeRoutineTaskMarker,
} from './routineMarker';

export const ROUTINE_DEFINITION_START = '<!-- time-grid-routines:start version="1" -->';
export const ROUTINE_DEFINITION_END = '<!-- time-grid-routines:end -->';
export const ROUTINE_SLOT_START = '<!-- time-grid-routine-slot:start -->';
export const ROUTINE_SLOT_END = '<!-- time-grid-routine-slot:end -->';
export const ROUTINE_INSTANCE_START_PREFIX = '<!-- time-grid-routine-instances:start ';
export const ROUTINE_INSTANCE_END = '<!-- time-grid-routine-instances:end -->';
const GROUP_PREFIX = '<!-- time-grid-routine-group ';
const ITEM_PREFIX = '<!-- time-grid-routine-item ';
const GROUP_INSTANCE_PREFIX = '<!-- time-grid-routine-group-instance ';

export interface RoutineParseResult {
	document: RoutineDocument;
	diagnostics: RoutineDiagnostic[];
}

export interface LegacyRoutineBlock {
	startLine: number;
	endLine: number;
	title: string;
	subtitle?: string;
	taskLines: Array<{ line: number; raw: string; title: string }>;
}

export interface RoutineInstanceParseResult {
	groups: RoutineGroupViewModel[];
	instances: RoutineInstance[];
	diagnostics: RoutineDiagnostic[];
}

export function parseRoutineDocument(content: string): RoutineParseResult {
	const diagnostics: RoutineDiagnostic[] = [];
	const startHits = findAll(content, ROUTINE_DEFINITION_START);
	const endHits = findAll(content, ROUTINE_DEFINITION_END);
	if (startHits.length !== 1 || endHits.length !== 1 || endHits[0] <= startHits[0]) {
		return {
			document: EMPTY_ROUTINE_DOCUMENT,
			diagnostics: [{
				code: 'definition-invalid',
				message: 'Routine 配置区域缺失或重复，请保留唯一的开始和结束标记',
				blocking: true,
			}],
		};
	}

	const body = content.slice(startHits[0] + ROUTINE_DEFINITION_START.length, endHits[0]);
	const lines = body.split(/\r?\n/);
	const groups: RoutineGroupDefinition[] = [];
	let current: RoutineGroupDefinition | null = null;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith(GROUP_PREFIX) && trimmed.endsWith('-->')) {
			const attrs = parseHtmlAttributes(trimmed.slice(GROUP_PREFIX.length, -3));
			if (!attrs.id) {
				diagnostics.push({ code: 'definition-invalid', message: 'Routine 组合缺少稳定 ID', blocking: true });
				current = null;
				continue;
			}
			current = {
				id: attrs.id,
				title: '',
				enabled: attrs.enabled !== 'false',
				order: parseOrder(attrs.order, groups.length),
				items: [],
			};
			groups.push(current);
			continue;
		}
		if (!current) continue;
		if (!current.title && /^#{1,6}\s+/.test(trimmed)) {
			current.title = trimmed.replace(/^#{1,6}\s+/, '').trim();
			continue;
		}
		if (trimmed.startsWith('> ') && !current.subtitle) {
			current.subtitle = trimmed.slice(2).trim();
			continue;
		}
		const item = parseDefinitionItemLine(trimmed, current.items.length, diagnostics);
		if (item) current.items.push(item);
	}

	const seen = new Set<string>();
	for (const group of groups) {
		if (!group.title) diagnostics.push({ code: 'definition-invalid', message: `组合 ${group.id} 缺少标题`, blocking: true });
		checkDuplicateId(group.id, seen, diagnostics);
		for (const item of group.items) checkDuplicateId(item.id, seen, diagnostics);
		group.items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	}
	groups.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	return { document: { version: 1, groups }, diagnostics };
}

export function serializeRoutineDocument(document: RoutineDocument): string {
	const lines = ['# Time Grid Routines', '', '此文件由 Time Grid 管理。可阅读和备份；建议通过插件界面修改计划。', '', ROUTINE_DEFINITION_START];
	const groups = [...document.groups].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	for (const group of groups) {
		lines.push('', `${GROUP_PREFIX}${serializeHtmlAttributes({
			id: group.id,
			enabled: String(group.enabled),
			order: String(group.order),
		})} -->`);
		lines.push(`## ${sanitizeSingleLine(group.title)}`);
		if (group.subtitle) lines.push(`> ${sanitizeSingleLine(group.subtitle)}`);
		for (const item of [...group.items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
			lines.push(`- ${sanitizeSingleLine(item.title)} ${ITEM_PREFIX}${serializeHtmlAttributes({
				id: item.id,
				enabled: String(item.enabled),
				order: String(item.order),
				weekdays: normalizeWeekdays(item.schedule.weekdays).join(','),
				from: item.schedule.activeFrom,
				until: item.schedule.activeUntil,
				reminder: item.schedule.reminderTime,
				priority: item.priority,
			})} -->`);
		}
	}
	lines.push('', ROUTINE_DEFINITION_END, '');
	return lines.join('\n');
}

export function replaceRoutineDocumentRegion(content: string, document: RoutineDocument): { content: string; changed: boolean; error?: string } {
	const startHits = findAll(content, ROUTINE_DEFINITION_START);
	const endHits = findAll(content, ROUTINE_DEFINITION_END);
	if (startHits.length === 0 && endHits.length === 0) {
		const suffix = content.length === 0 || /\r?\n$/.test(content) ? '' : '\n';
		return { content: `${content}${suffix}${serializeRoutineDocument(document)}`, changed: true };
	}
	if (startHits.length !== 1 || endHits.length !== 1 || endHits[0] <= startHits[0]) {
		return { content, changed: false, error: 'Routine 配置标记重复或不完整' };
	}
	const end = endHits[0] + ROUTINE_DEFINITION_END.length;
	const region = serializeRoutineDocument(document).trimEnd();
	const next = `${content.slice(0, startHits[0])}${region}${content.slice(end)}`;
	return { content: next, changed: next !== content };
}

export function isRoutineItemActive(item: RoutineItemDefinition, dateKey: string): boolean {
	if (!item.enabled || !isValidDateKey(dateKey)) return false;
	if (item.schedule.activeFrom && dateKey < item.schedule.activeFrom) return false;
	if (item.schedule.activeUntil && dateKey > item.schedule.activeUntil) return false;
	const weekday = weekdayForDateKey(dateKey);
	return normalizeWeekdays(item.schedule.weekdays).includes(weekday);
}

export function activeRoutineGroups(document: RoutineDocument, dateKey: string): RoutineGroupDefinition[] {
	return document.groups
		.filter((group) => group.enabled)
		.map((group) => ({ ...group, items: group.items.filter((item) => isRoutineItemActive(item, dateKey)) }))
		.filter((group) => group.items.length > 0)
		.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function serializeRoutineInstances(document: RoutineDocument, dateKey: string): string {
	const lines = [`${ROUTINE_INSTANCE_START_PREFIX}${serializeHtmlAttributes({ date: dateKey })} -->`];
	const groups = activeRoutineGroups(document, dateKey);
	for (const [index, group] of groups.entries()) {
		// Obsidian merges consecutive quote lines into one callout. A raw blank
		// line (not `>`) is required so each group renders as its own [!CHECK].
		if (index > 0) lines.push('');
		lines.push(`> [!CHECK] :LiRotateCw: ${sanitizeSingleLine(group.title)}`);
		lines.push(`> ${GROUP_INSTANCE_PREFIX}${serializeHtmlAttributes({ id: group.id })} -->`);
		for (const item of group.items) {
			const priority = priorityMarker(item.priority);
			const marker = serializeRoutineTaskMarker({
				groupId: group.id,
				itemId: item.id,
				date: dateKey,
				reminderTime: item.schedule.reminderTime,
				todayOnly: false,
				legacy: false,
			});
			lines.push(`> - [ ] ${sanitizeSingleLine(item.title)}${priority ? ` ${priority}` : ''} ${marker}`);
		}
	}
	lines.push(ROUTINE_INSTANCE_END);
	return lines.join('\n');
}

export function separateRoutineInstanceCallouts(content: string): { content: string; changed: boolean } {
	const lines = splitLinesWithEndings(content);
	let startLine = -1;
	let endLine = -1;
	for (let index = 0; index < lines.length; index++) {
		if (startLine < 0 && lines[index].text.includes(ROUTINE_INSTANCE_START_PREFIX)) startLine = index;
		if (lines[index].text.includes(ROUTINE_INSTANCE_END)) {
			endLine = index;
			break;
		}
	}
	if (startLine < 0 || endLine < 0 || endLine <= startLine) return { content, changed: false };

	const next: Array<{ text: string; ending: string }> = [];
	let sawCheck = false;
	let changed = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (index > startLine && index < endLine && /^\s*>\s*\[!CHECK\]/i.test(line.text)) {
			if (sawCheck) {
				const previous = next[next.length - 1];
				if (previous && /^\s*>/.test(previous.text)) {
					next.push({ text: '', ending: line.ending || detectLineEnding(content) });
					changed = true;
				}
			}
			sawCheck = true;
		}
		next.push(line);
	}
	if (!changed) return { content, changed: false };
	return { content: next.map((line) => line.text + line.ending).join(''), changed: true };
}

export function insertRoutineInstancesAtSlot(content: string, document: RoutineDocument, dateKey: string): { content: string; changed: boolean; error?: string } {
	if (content.includes(ROUTINE_INSTANCE_START_PREFIX)) return { content, changed: false };
	const starts = findAll(content, ROUTINE_SLOT_START);
	const ends = findAll(content, ROUTINE_SLOT_END);
	if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) {
		return { content, changed: false, error: '今日日记缺少唯一的 Time Grid 每日流程槽位' };
	}
	const end = ends[0] + ROUTINE_SLOT_END.length;
	const block = adaptLineEnding(serializeRoutineInstances(document, dateKey), detectLineEnding(content));
	return { content: `${content.slice(0, starts[0])}${block}${content.slice(end)}`, changed: true };
}

export function findLegacyRoutineBlocks(content: string): LegacyRoutineBlock[] {
	const lines = splitLines(content);
	const blocks: LegacyRoutineBlock[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (!isLegacyRoutineHeading(lines[index])) continue;
		const startLine = index;
		const title = legacyHeadingTitle(lines[index]);
		const taskLines: LegacyRoutineBlock['taskLines'] = [];
		let endLine = index;
		for (let cursor = index + 1; cursor < lines.length; cursor++) {
			const line = lines[cursor];
			if (line.trim() === '') {
				endLine = cursor - 1;
				break;
			}
			if (!/^\s*>/.test(line)) {
				endLine = cursor - 1;
				break;
			}
			endLine = cursor;
			if (isTaskLine(line)) {
				taskLines.push({ line: cursor, raw: line, title: titleFromTaskRaw(line) });
			}
			if (cursor === lines.length - 1) endLine = cursor;
		}
		blocks.push({ startLine, endLine: Math.max(startLine, endLine), title, taskLines });
		index = Math.max(index, endLine);
	}
	return blocks;
}

export function routineDocumentFromLegacy(content: string): RoutineDocument {
	const groups = findLegacyRoutineBlocks(content).map((block, groupIndex) => ({
		id: stableRoutineId('group', block.title, groupIndex),
		title: block.title || '每日流程',
		enabled: true,
		order: groupIndex,
		items: block.taskLines.map((task, itemIndex) => ({
			id: stableRoutineId('item', `${block.title}:${task.title}`, itemIndex),
			title: task.title,
			enabled: true,
			order: itemIndex,
			schedule: { weekdays: [1, 2, 3, 4, 5, 6, 7] as RoutineWeekday[] },
		})),
	}));
	return { version: 1, groups };
}

export function replaceLegacyRoutineWithSlot(content: string): { content: string; changed: boolean; error?: string } {
	const blocks = findLegacyRoutineBlocks(content);
	if (blocks.length !== 1) {
		return { content, changed: false, error: blocks.length === 0 ? '模板中没有找到每日流程区块' : '模板中发现多个旧每日流程区块' };
	}
	const lines = splitLinesWithEndings(content);
	const block = blocks[0];
	const eol = detectLineEnding(content);
	const replacement = `${ROUTINE_SLOT_START}${eol}${ROUTINE_SLOT_END}${lines[block.endLine]?.ending ?? eol}`;
	const next = [
		...lines.slice(0, block.startLine),
		{ text: replacement, ending: '' },
		...lines.slice(block.endLine + 1),
	].map((line) => line.text + line.ending).join('');
	return { content: next, changed: next !== content };
}

export function adoptLegacyRoutineInstances(
	content: string,
	document: RoutineDocument,
	dateKey: string
): { content: string; changed: boolean; error?: string } {
	const blocks = findLegacyRoutineBlocks(content);
	if (blocks.length === 0) return { content, changed: false };
	const lines = splitLinesWithEndings(content);
	const claimedGroups = new Set<string>();
	for (const block of blocks) {
		const title = displayRoutineTitle(block.title).toLocaleLowerCase();
		const matches = document.groups.filter((group) => displayRoutineTitle(group.title).toLocaleLowerCase() === title);
		if (matches.length !== 1 || claimedGroups.has(matches[0].id)) {
			return { content, changed: false, error: `无法唯一匹配旧流程组合“${block.title}”，已保持只读` };
		}
		const group = matches[0];
		claimedGroups.add(group.id);
		const claimedItems = new Set<string>();
		for (const taskLine of block.taskLines) {
			if (parseRoutineTaskMarker(taskLine.raw)) continue;
			const taskTitle = displayRoutineTitle(taskLine.title).toLocaleLowerCase();
			const itemMatches = group.items.filter((item) => displayRoutineTitle(item.title).toLocaleLowerCase() === taskTitle);
			if (itemMatches.length === 0) continue;
			if (itemMatches.length !== 1 || claimedItems.has(itemMatches[0].id)) {
				return { content, changed: false, error: `无法唯一匹配旧流程项目“${taskLine.title}”，已保持只读` };
			}
			const item = itemMatches[0];
			claimedItems.add(item.id);
			const marker = serializeRoutineTaskMarker({
				groupId: group.id,
				itemId: item.id,
				date: dateKey,
				reminderTime: item.schedule.reminderTime,
				todayOnly: false,
				legacy: true,
			});
			lines[taskLine.line].text = `${lines[taskLine.line].text.trimEnd()} ${marker}`;
		}
	}
	const next = lines.map((line) => line.text + line.ending).join('');
	return { content: next, changed: next !== content };
}

export function getRoutineTaskLineNumbers(content: string): Set<number> {
	const lines = splitLines(content);
	const result = new Set<number>();
	let inInstanceRegion = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line.includes(ROUTINE_INSTANCE_START_PREFIX)) inInstanceRegion = true;
		if (inInstanceRegion && isTaskLine(line)) result.add(index);
		if (line.includes(ROUTINE_INSTANCE_END)) inInstanceRegion = false;
	}
	for (const block of findLegacyRoutineBlocks(content)) {
		for (const task of block.taskLines) result.add(task.line);
	}
	return result;
}

export function parseRoutineInstances(
	content: string,
	filePath: string,
	dateKey: string,
	document: RoutineDocument,
	goalTag: string
): RoutineInstanceParseResult {
	const lines = splitLines(content);
	const diagnostics: RoutineDiagnostic[] = [];
	const instances: RoutineInstance[] = [];
	const regionStarts = lines.filter((line) => line.includes(ROUTINE_INSTANCE_START_PREFIX)).length;
	const regionEnds = lines.filter((line) => line.includes(ROUTINE_INSTANCE_END)).length;
	if ((regionStarts > 0 || regionEnds > 0) && (regionStarts !== 1 || regionEnds !== 1)) {
		diagnostics.push({ code: 'instance-invalid', message: '每日流程实例区域标记重复或不完整', blocking: true });
	}
	const seenInstances = new Map<string, TGTask>();
	const groupsById = new Map(document.groups.map((group) => [group.id, group]));
	let inRegion = false;
	let currentGroupId: string | null = null;
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const raw = lines[lineNumber].replace(/\r$/, '');
		if (raw.includes(ROUTINE_INSTANCE_START_PREFIX)) {
			inRegion = true;
			continue;
		}
		if (raw.includes(ROUTINE_INSTANCE_END)) {
			inRegion = false;
			currentGroupId = null;
			continue;
		}
		if (!inRegion) continue;
		const groupMarkerIndex = raw.indexOf(GROUP_INSTANCE_PREFIX);
		if (groupMarkerIndex >= 0) {
			const close = raw.indexOf('-->', groupMarkerIndex);
			const attrs = close >= 0 ? parseHtmlAttributes(raw.slice(groupMarkerIndex + GROUP_INSTANCE_PREFIX.length, close)) : {};
			currentGroupId = attrs.id ?? null;
			continue;
		}
		if (!isTaskLine(raw)) continue;
		const parsedMarker = parseRoutineTaskMarker(raw);
		const groupId = parsedMarker?.meta.groupId ?? currentGroupId ?? 'today-only';
		const task = parseTaskLine(raw, filePath, lineNumber, dateKey, goalTag);
		const meta = parsedMarker?.meta ?? {
			groupId,
			date: dateKey,
			todayOnly: true,
			legacy: false,
		};
		task.routine = meta;
		if (raw.includes(ROUTINE_ITEM_INSTANCE_PREFIX) && !parsedMarker) {
			markRoutineTaskInvalid(task, '每日流程实例标识格式异常');
			diagnostics.push({ code: 'instance-invalid', message: `第 ${lineNumber + 1} 行的流程实例标识格式异常`, blocking: true });
		}
		if (meta.date !== dateKey) {
			markRoutineTaskInvalid(task, `流程实例日期 ${meta.date} 与日记日期 ${dateKey} 不一致`);
			diagnostics.push({ code: 'instance-invalid', message: `第 ${lineNumber + 1} 行的流程实例日期与日记不一致`, blocking: true });
		}
		markDuplicateRoutineInstance(seenInstances, task, meta, diagnostics, lineNumber);
		task.section = terminalStatus(task.status) ? 'done' : 'today';
		instances.push({
			id: `${filePath}#routine:${groupId}:${meta.itemId ?? lineNumber}:${dateKey}`,
			groupId,
			itemId: meta.itemId,
			date: meta.date,
			reminderTime: meta.reminderTime,
			todayOnly: meta.todayOnly,
			legacy: meta.legacy,
			task,
		});
	}

	if (instances.length === 0) {
		for (const [blockIndex, block] of findLegacyRoutineBlocks(content).entries()) {
			const group = matchLegacyGroup(block.title, document.groups);
			for (const [itemIndex, itemLine] of block.taskLines.entries()) {
				const marker = parseRoutineTaskMarker(itemLine.raw);
				const markedGroup = marker ? groupsById.get(marker.meta.groupId) : undefined;
				const definition = marker?.meta.itemId
					? markedGroup?.items.find((item) => item.id === marker.meta.itemId)
					: matchLegacyItem(itemLine.title, group?.items ?? []);
				const task = parseTaskLine(itemLine.raw, filePath, itemLine.line, dateKey, goalTag);
				const meta = marker?.meta ?? {
					groupId: group?.id ?? `legacy-group-${blockIndex}`,
					itemId: definition?.id,
					date: dateKey,
					reminderTime: definition?.schedule.reminderTime,
					todayOnly: !definition,
					legacy: true,
				};
				task.routine = meta;
				if (itemLine.raw.includes(ROUTINE_ITEM_INSTANCE_PREFIX) && !marker) {
					markRoutineTaskInvalid(task, '每日流程实例标识格式异常');
					diagnostics.push({ code: 'instance-invalid', message: `第 ${itemLine.line + 1} 行的流程实例标识格式异常`, blocking: true });
				}
				if (meta.date !== dateKey) markRoutineTaskInvalid(task, `流程实例日期 ${meta.date} 与日记日期 ${dateKey} 不一致`);
				markDuplicateRoutineInstance(seenInstances, task, meta, diagnostics, itemLine.line);
				task.section = terminalStatus(task.status) ? 'done' : 'today';
				instances.push({
					id: `${filePath}#routine:${meta.groupId}:${meta.itemId ?? itemLine.line}:${dateKey}`,
					groupId: meta.groupId,
					itemId: meta.itemId,
					date: dateKey,
					reminderTime: meta.reminderTime,
					todayOnly: meta.todayOnly,
					legacy: true,
					task,
				});
			}
		}
	}

	const groupModels = buildGroupViewModels(instances, document, groupsById);
	return { groups: groupModels, instances, diagnostics };
}

export function buildGroupViewModels(
	instances: RoutineInstance[],
	document: RoutineDocument,
	groupsById = new Map(document.groups.map((group) => [group.id, group]))
): RoutineGroupViewModel[] {
	const byGroup = new Map<string, RoutineInstance[]>();
	for (const instance of instances) {
		const items = byGroup.get(instance.groupId) ?? [];
		items.push(instance);
		byGroup.set(instance.groupId, items);
	}
	return [...byGroup.entries()].map(([groupId, items], index) => {
		const definition = groupsById.get(groupId);
		return {
			id: groupId,
			title: definition?.title ?? (groupId === 'today-only' ? '仅今天' : '每日流程'),
			subtitle: definition?.subtitle,
			enabled: definition?.enabled ?? true,
			order: definition?.order ?? document.groups.length + index,
			items: items.sort(compareInstances(definition)),
		};
	}).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function stableRoutineId(prefix: string, value: string, index: number): string {
	let hash = 2166136261;
	const source = `${prefix}:${displayRoutineTitle(value)}:${index}`;
	for (let cursor = 0; cursor < source.length; cursor++) {
		hash ^= source.charCodeAt(cursor);
		hash = Math.imul(hash, 16777619);
	}
	return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function newRoutineId(prefix: 'group' | 'item'): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function previousDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() - 1);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseDefinitionItemLine(line: string, fallbackOrder: number, diagnostics: RoutineDiagnostic[]): RoutineItemDefinition | null {
	const markerIndex = line.indexOf(ITEM_PREFIX);
	if (!line.startsWith('- ') || markerIndex < 0 || !line.endsWith('-->')) return null;
	const title = line.slice(2, markerIndex).trim();
	const attrs = parseHtmlAttributes(line.slice(markerIndex + ITEM_PREFIX.length, -3));
	if (!attrs.id || !title) {
		diagnostics.push({ code: 'definition-invalid', message: 'Routine 项目缺少标题或稳定 ID', blocking: true });
		return null;
	}
	const weekdays = parseWeekdays(attrs.weekdays);
	const activeFrom = validOptionalDate(attrs.from, diagnostics, title, '生效日期');
	const activeUntil = validOptionalDate(attrs.until, diagnostics, title, '结束日期');
	if (activeFrom && activeUntil && activeFrom > activeUntil) {
		diagnostics.push({ code: 'definition-invalid', message: `${displayRoutineTitle(title)} 的生效日期晚于结束日期`, blocking: true });
	}
	const priority = parsePriority(attrs.priority);
	return {
		id: attrs.id,
		title,
		enabled: attrs.enabled !== 'false',
		order: parseOrder(attrs.order, fallbackOrder),
		priority,
		schedule: {
			weekdays,
			activeFrom,
			activeUntil,
			reminderTime: normalizeTime(attrs.reminder),
		},
	};
}

function parseWeekdays(value: string | undefined): RoutineWeekday[] {
	if (!value) return [1, 2, 3, 4, 5, 6, 7];
	const weekdays = value.split(',').map(Number).filter((day): day is RoutineWeekday => Number.isInteger(day) && day >= 1 && day <= 7);
	return normalizeWeekdays(weekdays);
}

function normalizeWeekdays(value: RoutineWeekday[]): RoutineWeekday[] {
	return [...new Set(value)].sort((a, b) => a - b) as RoutineWeekday[];
}

function weekdayForDateKey(value: string): RoutineWeekday {
	const [year, month, day] = value.split('-').map(Number);
	const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return (jsDay === 0 ? 7 : jsDay) as RoutineWeekday;
}

function validOptionalDate(value: string | undefined, diagnostics: RoutineDiagnostic[], title: string, label: string): string | undefined {
	if (!value) return undefined;
	if (isValidDateKey(value)) return value;
	diagnostics.push({ code: 'definition-invalid', message: `${displayRoutineTitle(title)} 的${label}无效`, blocking: true });
	return undefined;
}

function isValidDateKey(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function parsePriority(value: string | undefined): TaskPriority | undefined {
	return value === 'highest' || value === 'high' || value === 'medium' || value === 'low' || value === 'lowest' ? value : undefined;
}

function parseOrder(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function checkDuplicateId(id: string, seen: Set<string>, diagnostics: RoutineDiagnostic[]): void {
	if (seen.has(id)) diagnostics.push({ code: 'duplicate-id', message: `Routine 稳定 ID 重复：${id}`, blocking: true });
	seen.add(id);
}

function findAll(content: string, needle: string): number[] {
	const hits: number[] = [];
	let cursor = 0;
	while (cursor <= content.length) {
		const index = content.indexOf(needle, cursor);
		if (index < 0) break;
		hits.push(index);
		cursor = index + needle.length;
	}
	return hits;
}

function sanitizeSingleLine(value: string): string {
	return value.replace(/[\r\n]+/g, ' ').replace(/<!--\s*time-grid-/gi, '').trim();
}

function splitLines(content: string): string[] {
	return content.split('\n').map((line) => line.replace(/\r$/, ''));
}

function splitLinesWithEndings(content: string): Array<{ text: string; ending: string }> {
	const lines: Array<{ text: string; ending: string }> = [];
	const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(content)) !== null) {
		if (match[0] === '') break;
		lines.push({ text: match[1], ending: match[2] });
		if (match[2] === '') break;
	}
	return lines;
}

function detectLineEnding(content: string): string {
	return content.includes('\r\n') ? '\r\n' : '\n';
}

function adaptLineEnding(value: string, eol: string): string {
	return eol === '\n' ? value : value.replace(/\n/g, eol);
}

function isLegacyRoutineHeading(line: string): boolean {
	return /^\s*>\s*\[!CHECK\]/i.test(line) && /(每日流程|每日惯例|Routine)/i.test(line);
}

function legacyHeadingTitle(line: string): string {
	return displayRoutineTitle(line.replace(/^\s*>\s*\[!CHECK\]\s*/i, '').replace(/:[A-Za-z0-9]+:/g, '').trim()) || '每日流程';
}

function isTaskLine(line: string): boolean {
	return /^(?:\s*>\s*)?(?:[-+*]|\d+[.)])\s+\[[^\]]\]/.test(line);
}

function titleFromTaskRaw(raw: string): string {
	const marker = parseRoutineTaskMarker(raw);
	const withoutMarker = marker ? `${raw.slice(0, marker.start)}${raw.slice(marker.end)}` : raw;
	return withoutMarker
		.replace(/^\s*>\s*/, '')
		.replace(/^(?:[-+*]|\d+[.)])\s+\[[^\]]\]\s*/, '')
		.replace(/[📅⏳🛫➕✅❌][ \t]*\d{4}-\d{2}-\d{2}/g, '')
		.replace(/[🔺⏫🔼🔽⏬]/g, '')
		.trim();
}

function terminalStatus(status: TaskStatusKind): boolean {
	return status === 'done' || status === 'cancelled';
}

function matchLegacyGroup(title: string, groups: RoutineGroupDefinition[]): RoutineGroupDefinition | undefined {
	const normalized = displayRoutineTitle(title).toLocaleLowerCase();
	const matches = groups.filter((group) => displayRoutineTitle(group.title).toLocaleLowerCase() === normalized);
	return matches.length === 1 ? matches[0] : undefined;
}

function matchLegacyItem(title: string, items: RoutineItemDefinition[]): RoutineItemDefinition | undefined {
	const normalized = displayRoutineTitle(title).toLocaleLowerCase();
	const matches = items.filter((item) => displayRoutineTitle(item.title).toLocaleLowerCase() === normalized);
	return matches.length === 1 ? matches[0] : undefined;
}

function compareInstances(definition: RoutineGroupDefinition | undefined): (a: RoutineInstance, b: RoutineInstance) => number {
	const order = new Map((definition?.items ?? []).map((item) => [item.id, item.order]));
	return (a, b) => (order.get(a.itemId ?? '') ?? Number.MAX_SAFE_INTEGER) - (order.get(b.itemId ?? '') ?? Number.MAX_SAFE_INTEGER)
		|| a.task.line - b.task.line;
}

function markRoutineTaskInvalid(task: TGTask, message: string): void {
	task.diagnostics.push({ code: 'routine-instance-invalid', message, blocking: true });
}

function markDuplicateRoutineInstance(
	seen: Map<string, TGTask>,
	task: TGTask,
	meta: { groupId: string; itemId?: string; date: string; todayOnly: boolean },
	diagnostics: RoutineDiagnostic[],
	lineNumber: number
): void {
	if (!meta.itemId || meta.todayOnly) return;
	const key = `${meta.groupId}:${meta.itemId}:${meta.date}`;
	const previous = seen.get(key);
	if (!previous) {
		seen.set(key, task);
		return;
	}
	const message = `流程实例 ID 重复：${meta.itemId}`;
	markRoutineTaskInvalid(previous, message);
	markRoutineTaskInvalid(task, message);
	diagnostics.push({ code: 'instance-invalid', message: `第 ${lineNumber + 1} 行发现重复的流程实例 ${meta.itemId}`, blocking: true });
}
