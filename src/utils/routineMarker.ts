import { RoutineTaskMeta, TaskPriority } from '../types/task';

export const ROUTINE_ITEM_INSTANCE_PREFIX = '<!-- time-grid-routine-instance ';

export interface RoutineMarkerAttributes {
	group: string;
	item?: string;
	date: string;
	reminder?: string;
	todayOnly?: boolean;
	legacy?: boolean;
}

export function parseRoutineTaskMarker(raw: string): { start: number; end: number; meta: RoutineTaskMeta } | null {
	const start = raw.indexOf(ROUTINE_ITEM_INSTANCE_PREFIX);
	if (start < 0) return null;
	const close = raw.indexOf('-->', start + ROUTINE_ITEM_INSTANCE_PREFIX.length);
	if (close < 0) return null;
	const end = close + 3;
	const attributes = parseHtmlAttributes(raw.slice(start + ROUTINE_ITEM_INSTANCE_PREFIX.length, close));
	if (!attributes.group || !attributes.date) return null;
	return {
		start,
		end,
		meta: {
			groupId: attributes.group,
			itemId: attributes.item || undefined,
			date: attributes.date,
			reminderTime: normalizeTime(attributes.reminder),
			todayOnly: attributes.todayOnly === 'true',
			legacy: attributes.legacy === 'true',
		},
	};
}

export function serializeRoutineTaskMarker(meta: RoutineTaskMeta): string {
	const attributes: Record<string, string> = {
		group: meta.groupId,
		date: meta.date,
	};
	if (meta.itemId) attributes.item = meta.itemId;
	if (meta.reminderTime) attributes.reminder = meta.reminderTime;
	if (meta.todayOnly) attributes.todayOnly = 'true';
	if (meta.legacy) attributes.legacy = 'true';
	return `${ROUTINE_ITEM_INSTANCE_PREFIX}${serializeHtmlAttributes(attributes)} -->`;
}

export function replaceRoutineTaskMarker(raw: string, meta: RoutineTaskMeta): string {
	const marker = parseRoutineTaskMarker(raw);
	if (!marker) return `${raw.trimEnd()} ${serializeRoutineTaskMarker(meta)}`;
	return `${raw.slice(0, marker.start)}${serializeRoutineTaskMarker(meta)}${raw.slice(marker.end)}`;
}

export function parseHtmlAttributes(raw: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const pattern = /([A-Za-z][A-Za-z0-9_-]*)="((?:[^"\\]|\\.)*)"/g;
	for (const match of raw.matchAll(pattern)) {
		attributes[match[1]] = unescapeAttribute(match[2]);
	}
	return attributes;
}

export function serializeHtmlAttributes(attributes: Record<string, string | undefined>): string {
	return Object.entries(attributes)
		.filter((entry): entry is [string, string] => entry[1] !== undefined)
		.map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
		.join(' ');
}

export function normalizeTime(value: string | undefined): string | undefined {
	if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
	return value;
}

export function priorityMarker(priority: TaskPriority | undefined): string {
	return ({ highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' } as Record<TaskPriority, string>)[priority as TaskPriority] ?? '';
}

export function displayRoutineTitle(value: string): string {
	return value
		.replace(/==/g, '')
		.replace(/\*{1,3}/g, '')
		.replace(/_{1,3}/g, '')
		.replace(/~~/g, '')
		.replace(/`/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeAttribute(value: string): string {
	return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
