import { Notice } from 'obsidian';
import { RoutineInstance, RoutineSettings } from '../types/routine';
import { RoutineIndex } from './routineIndex';

export class RoutineReminderScheduler {
	private index: RoutineIndex;
	private getSettings: () => RoutineSettings;
	private saveSettings: (settings: RoutineSettings) => Promise<void>;
	private timers = new Map<string, number>();
	private unsubscribe: (() => void) | null = null;

	constructor(
		index: RoutineIndex,
		getSettings: () => RoutineSettings,
		saveSettings: (settings: RoutineSettings) => Promise<void>
	) {
		this.index = index;
		this.getSettings = getSettings;
		this.saveSettings = saveSettings;
		this.unsubscribe = index.onChange(() => this.reschedule());
		this.reschedule();
	}

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
	}

	private reschedule(): void {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
		const snapshot = this.index.getSnapshot();
		if (!snapshot.todayNoteExists || snapshot.isIndexing) return;
		const now = new Date();
		for (const instance of snapshot.groups.flatMap((group) => group.items)) {
			if (!instance.reminderTime || terminal(instance)) continue;
			const fireAt = reminderDate(snapshot.today, instance.reminderTime);
			if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
			const key = reminderKey(instance);
			if (this.getSettings().reminderLog[key]) continue;
			const delay = fireAt.getTime() - now.getTime();
			const timer = window.setTimeout(() => void this.fire(instance), delay);
			this.timers.set(key, timer);
		}
	}

	private async fire(instance: RoutineInstance): Promise<void> {
		const key = reminderKey(instance);
		this.timers.delete(key);
		const current = this.index.getSnapshot().groups.flatMap((group) => group.items)
			.find((candidate) => candidate.id === instance.id);
		if (!current || terminal(current) || this.getSettings().reminderLog[key]) return;
		new Notice(`每日流程提醒：${current.task.description}`, 10000);
		const settings = this.getSettings();
		const reminderLog = pruneReminderLog({ ...settings.reminderLog, [key]: true }, this.index.getSnapshot().today);
		await this.saveSettings({ ...settings, reminderLog });
	}
}

export function isRoutineReminderDue(instance: RoutineInstance, now: Date, todayKey: string): boolean {
	if (!instance.reminderTime || terminal(instance) || instance.date !== todayKey) return false;
	const reminder = reminderDate(todayKey, instance.reminderTime);
	return Boolean(reminder && reminder.getTime() <= now.getTime());
}

export function reminderKey(instance: RoutineInstance): string {
	return `${instance.date}:${instance.itemId ?? instance.id}`;
}

function reminderDate(dateKey: string, time: string): Date | null {
	const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
	const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
	if (!dateMatch || !timeMatch) return null;
	return new Date(
		Number(dateMatch[1]),
		Number(dateMatch[2]) - 1,
		Number(dateMatch[3]),
		Number(timeMatch[1]),
		Number(timeMatch[2]),
		0,
		0
	);
}

function terminal(instance: RoutineInstance): boolean {
	return instance.task.status === 'done' || instance.task.status === 'cancelled';
}

function pruneReminderLog(log: Record<string, boolean>, today: string): Record<string, boolean> {
	return Object.fromEntries(Object.entries(log).filter(([key]) => key.startsWith(`${today}:`)));
}
