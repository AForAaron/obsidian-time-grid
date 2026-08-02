import { App, Notice, TFile, moment } from 'obsidian';
import type { Moment } from 'moment';
import {
	appHasDailyNotesPluginLoaded,
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
	getDailyNoteSettings,
} from 'obsidian-daily-notes-interface';

function formatDateWithMoment(date: Date, format: string): string {
	const moment = (window as Window & { moment?: (d?: Date) => { format: (fmt: string) => string } }).moment;
	if (moment) {
		return moment(date).format(format || 'YYYY-MM-DD');
	}
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function getMomentDate(date: Date): Moment {
	return moment(date);
}

export async function openOrCreateDailyNoteForDate(
	app: App,
	date: Date,
	confirmCreate = true
): Promise<void> {
	if (!appHasDailyNotesPluginLoaded()) {
		new Notice('请先在设置中启用核心插件「日记」。');
		return;
	}

	const momentDate = getMomentDate(date);

	const settings = getDailyNoteSettings();
	const displayDate = formatDateWithMoment(date, settings?.format ?? 'YYYY-MM-DD');

	const allNotes = getAllDailyNotes();
	const existing = getDailyNote(momentDate, allNotes);
	if (existing instanceof TFile) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(existing);
		return;
	}

	if (confirmCreate) {
		const confirmed = window.confirm(`日记 ${displayDate} 不存在，是否创建？`);
		if (!confirmed) {
			return;
		}
	}

	const created = await createDailyNote(momentDate);
	if (created instanceof TFile) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(created);
	}
}

export function getDailyNoteFileForDate(app: App, date: Date): TFile | null {
	if (!appHasDailyNotesPluginLoaded()) {
		return null;
	}
	const momentDate = getMomentDate(date);
	const allNotes = getAllDailyNotes();
	const existing = getDailyNote(momentDate, allNotes);
	return existing instanceof TFile ? existing : null;
}

export function isDailyNotesAvailable(): boolean {
	return appHasDailyNotesPluginLoaded();
}

export async function getOrCreateDailyNoteFileForDate(app: App, date: Date): Promise<TFile | null> {
	if (!appHasDailyNotesPluginLoaded()) return null;
	const momentDate = getMomentDate(date);
	const existing = getDailyNote(momentDate, getAllDailyNotes());
	if (existing instanceof TFile) return existing;
	const created = await createDailyNote(momentDate);
	return created instanceof TFile ? created : null;
}

/**
 * 若核心「日记」插件已启用，则打开或创建当天的日记并应用模板；否则提示用户。
 */
export async function openOrCreateTodayDailyNote(app: App): Promise<void> {
	const date = new Date();
	await openOrCreateDailyNoteForDate(app, date, false);
}
