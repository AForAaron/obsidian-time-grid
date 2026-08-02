export interface SimpleTimeTrackerEntry {
	name: string;
	startTime?: string | null;
	endTime?: string | null;
	subEntries?: SimpleTimeTrackerEntry[];
}

export interface SimpleTimeTrackerData {
	entries?: SimpleTimeTrackerEntry[];
}

export interface DurationBucket {
	name: string;
	durationMs: number;
	isRunning: boolean;
}

const SIMPLE_TRACKER_REGEX = /```simple-time-tracker\s*([\s\S]*?)```/m;

export type SimpleTimeTrackerParseResult =
	| { status: 'ok'; data: SimpleTimeTrackerData }
	| { status: 'missing' | 'invalid'; data: null };

function formatDateFallback(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function getDailyNoteFilename(date: Date): string {
	const moment = (window as Window & { moment?: (d?: Date) => { format: (fmt: string) => string } }).moment;
	if (moment) {
		return moment(date).format('YYYY-MM-DD');
	}
	return formatDateFallback(date);
}

export function getDailyNotePath(basePath: string, date: Date): string {
	return `${basePath}/${getDailyNoteFilename(date)}.md`;
}

export function parseSimpleTimeTracker(content: string): SimpleTimeTrackerParseResult {
	const match = content.match(SIMPLE_TRACKER_REGEX);
	if (!match) {
		return { status: 'missing', data: null };
	}
	try {
		const body = match[1].trim();
		return { status: 'ok', data: body ? JSON.parse(body) as SimpleTimeTrackerData : { entries: [] } };
	} catch {
		return { status: 'invalid', data: null };
	}
}

export function extractSimpleTimeTracker(content: string): SimpleTimeTrackerData | null {
	const result = parseSimpleTimeTracker(content);
	return result.status === 'ok' ? result.data : null;
}

function getEntryDuration(
	entry: SimpleTimeTrackerEntry,
	now: Date,
	rangeStart?: Date,
	rangeEnd?: Date
): { durationMs: number; isRunning: boolean } {
	if (entry.subEntries && entry.subEntries.length > 0) {
		return entry.subEntries.reduce(
			(total, subEntry) => {
				const subTotal = getEntryDuration(subEntry, now, rangeStart, rangeEnd);
				return {
					durationMs: total.durationMs + subTotal.durationMs,
					isRunning: total.isRunning || subTotal.isRunning,
				};
			},
			{ durationMs: 0, isRunning: false }
		);
	}

	const start = entry.startTime ? Date.parse(entry.startTime) : NaN;
	const rawEnd = entry.endTime ? Date.parse(entry.endTime) : now.getTime();
	const startBound = rangeStart ? rangeStart.getTime() : Number.NEGATIVE_INFINITY;
	const endBound = rangeEnd ? rangeEnd.getTime() : Number.POSITIVE_INFINITY;
	const clampedStart = Math.max(start, startBound);
	const end = Math.min(rawEnd, endBound);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= clampedStart) {
		return { durationMs: 0, isRunning: false };
	}
	return {
		durationMs: end - clampedStart,
		isRunning: !entry.endTime,
	};
}

function collectEntries(
	entries: SimpleTimeTrackerEntry[] | undefined,
	now: Date,
	order: string[],
	buckets: Map<string, { durationMs: number; isRunning: boolean }>,
	rangeStart?: Date,
	rangeEnd?: Date
): void {
	if (!entries) {
		return;
	}

	const addBucket = (name: string, durationMs: number, isRunning: boolean) => {
		if (durationMs <= 0) {
			return;
		}
		if (!buckets.has(name)) {
			order.push(name);
			buckets.set(name, { durationMs, isRunning });
		} else {
			const previous = buckets.get(name);
			buckets.set(name, {
				durationMs: (previous?.durationMs ?? 0) + durationMs,
				isRunning: (previous?.isRunning ?? false) || isRunning,
			});
		}
	};

	for (const entry of entries) {
		const name = entry.name || '未命名';
		const duration = getEntryDuration(entry, now, rangeStart, rangeEnd);
		addBucket(name, duration.durationMs, duration.isRunning);
	}
}

export function aggregateDurations(
	data: SimpleTimeTrackerData | null,
	now: Date,
	rangeStart?: Date,
	rangeEnd?: Date
): DurationBucket[] {
	if (!data || !data.entries || data.entries.length === 0) {
		return [];
	}
	const order: string[] = [];
	const buckets = new Map<string, { durationMs: number; isRunning: boolean }>();
	collectEntries(data.entries, now, order, buckets, rangeStart, rangeEnd);

	return order
		.map((name) => {
			const bucket = buckets.get(name);
			return {
				name,
				durationMs: bucket?.durationMs ?? 0,
				isRunning: bucket?.isRunning ?? false,
			};
		})
		.filter((item) => item.durationMs > 0);
}
