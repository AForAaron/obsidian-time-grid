import { App, Modal, Notice, Setting } from 'obsidian';
import {
	RoutineGroupDefinition,
	RoutineInstance,
	RoutineItemDefinition,
	RoutineWeekday,
} from '../types/routine';
import { TaskPriority } from '../types/task';
import { RoutineWriter } from '../utils/routineWriter';
import { displayRoutineTitle } from '../utils/routineMarker';

const WEEKDAYS: Array<{ value: RoutineWeekday; label: string }> = [
	{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' },
	{ value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 7, label: '日' },
];

export class RoutineItemEditModal extends Modal {
	private writer: RoutineWriter;
	private groups: RoutineGroupDefinition[];
	private groupId: string;
	private item: RoutineItemDefinition;
	private instance?: RoutineInstance;
	private onSaved: () => void;

	constructor(
		app: App,
		writer: RoutineWriter,
		groups: RoutineGroupDefinition[],
		groupId: string,
		item: RoutineItemDefinition,
		onSaved: () => void,
		instance?: RoutineInstance
	) {
		super(app);
		this.writer = writer;
		this.groups = groups;
		this.groupId = groupId;
		this.item = cloneItem(item);
		this.instance = instance;
		this.onSaved = onSaved;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-modal', 'tg-routine-item-modal');
		this.titleEl.setText(this.instance ? '修改以后每天' : '编辑流程项目');
		const body = this.contentEl;
		body.empty();
		let targetGroupId = this.groupId;
		let title = displayRoutineTitle(this.item.title);
		let enabled = this.item.enabled;
		let priority: TaskPriority | '' = this.item.priority ?? '';
		let weekdays = new Set(this.item.schedule.weekdays);
		let activeFrom = this.item.schedule.activeFrom ?? '';
		let activeUntil = this.item.schedule.activeUntil ?? '';
		let reminderTime = this.item.schedule.reminderTime ?? '';
		let applyToday = false;

		new Setting(body).setName('项目名称').addText((text) => text
			.setValue(title)
			.onChange((value) => { title = value; }));
		new Setting(body).setName('所属组合').addDropdown((dropdown) => {
			for (const group of this.groups) dropdown.addOption(group.id, group.title);
			return dropdown.setValue(targetGroupId).onChange((value) => { targetGroupId = value; });
		});
		new Setting(body).setName('以后继续生成').addToggle((toggle) => toggle
			.setValue(enabled)
			.onChange((value) => { enabled = value; }));
		new Setting(body).setName('优先级').addDropdown((dropdown) => dropdown
			.addOption('', '无')
			.addOption('highest', '最高')
			.addOption('high', '高')
			.addOption('medium', '中')
			.addOption('low', '低')
			.addOption('lowest', '最低')
			.setValue(priority)
			.onChange((value) => { priority = value as TaskPriority | ''; }));

		const weekdaySetting = new Setting(body).setName('每周生成日');
		const weekdayRow = weekdaySetting.controlEl.createDiv('tg-routine-weekdays');
		for (const day of WEEKDAYS) {
			const button = weekdayRow.createEl('button', {
				text: day.label,
				cls: `tg-routine-weekday${weekdays.has(day.value) ? ' is-selected' : ''}`,
				attr: { type: 'button', 'aria-pressed': String(weekdays.has(day.value)), 'aria-label': `星期${day.label}` },
			});
			button.addEventListener('click', () => {
				if (weekdays.has(day.value)) weekdays.delete(day.value);
				else weekdays.add(day.value);
				button.toggleClass('is-selected', weekdays.has(day.value));
				button.setAttr('aria-pressed', String(weekdays.has(day.value)));
			});
		}
		new Setting(body).setName('生效日期').setDesc('留空表示立即生效').addText((text) => {
			text.inputEl.type = 'date';
			return text.setValue(activeFrom).onChange((value) => { activeFrom = value; });
		});
		new Setting(body).setName('结束日期').setDesc('首尾日期均包含').addText((text) => {
			text.inputEl.type = 'date';
			return text.setValue(activeUntil).onChange((value) => { activeUntil = value; });
		});
		new Setting(body).setName('提醒时间').setDesc('Obsidian 开启时弹出一次通知').addText((text) => {
			text.inputEl.type = 'time';
			return text.setValue(reminderTime).onChange((value) => { reminderTime = value; });
		});
		if (this.instance) {
			new Setting(body).setName('同时应用到今天').setDesc('默认关闭，避免改动已经开始执行的当天实例').addToggle((toggle) => toggle
				.setValue(false)
				.onChange((value) => { applyToday = value; }));
		}

		const footer = body.createDiv('tg-task-modal-footer');
		const cancel = footer.createEl('button', { text: '取消', cls: 'tg-task-button-quiet', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const save = footer.createEl('button', { text: '保存', cls: 'tg-task-button-primary', attr: { type: 'button' } });
		save.addEventListener('click', async () => {
			if (!title.trim()) return void new Notice('项目名称不能为空');
			if (weekdays.size === 0) return void new Notice('至少选择一个星期');
			if (activeFrom && activeUntil && activeFrom > activeUntil) return void new Notice('生效日期不能晚于结束日期');
			save.disabled = true;
			const result = await this.writer.updateItem(this.groupId, this.item.id, {
				title: title.trim(),
				enabled,
				priority: priority || undefined,
				clearPriority: !priority,
				weekdays: [...weekdays],
				activeFrom: activeFrom || null,
				activeUntil: activeUntil || null,
				reminderTime: reminderTime || null,
			}, applyToday, targetGroupId);
			if (!result.ok) { save.disabled = false; return; }
			this.close();
			this.onSaved();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function cloneItem(item: RoutineItemDefinition): RoutineItemDefinition {
	return { ...item, schedule: { ...item.schedule, weekdays: [...item.schedule.weekdays] } };
}
