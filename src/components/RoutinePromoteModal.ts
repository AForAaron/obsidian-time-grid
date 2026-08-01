import { App, Modal, Notice, Setting } from 'obsidian';
import { RoutineGroupDefinition, RoutineInstance } from '../types/routine';
import { RoutineWriter } from '../utils/routineWriter';
import { displayRoutineTitle } from '../utils/routineMarker';

export class RoutinePromoteModal extends Modal {
	constructor(
		app: App,
		private writer: RoutineWriter,
		private instance: RoutineInstance,
		private groups: RoutineGroupDefinition[],
		private onSaved: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-modal', 'tg-routine-promote-modal');
		this.titleEl.setText('加入以后每天');
		if (this.groups.length === 0) {
			this.contentEl.createDiv({ cls: 'tg-task-modal-error', text: '请先在“管理每日流程”中创建一个组合。' });
			return;
		}
		this.contentEl.createDiv({ cls: 'tg-task-modal-hint', text: `把“${displayRoutineTitle(this.instance.task.description)}”加入未来计划；今天实例不会重复。` });
		let groupId = this.instance.groupId && this.groups.some((group) => group.id === this.instance.groupId)
			? this.instance.groupId
			: this.groups[0].id;
		new Setting(this.contentEl).setName('目标组合').addDropdown((dropdown) => {
			for (const group of this.groups) dropdown.addOption(group.id, group.title);
			return dropdown.setValue(groupId).onChange((value) => { groupId = value; });
		});
		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		footer.createEl('button', { text: '取消', cls: 'tg-task-button-quiet', attr: { type: 'button' } }).addEventListener('click', () => this.close());
		const save = footer.createEl('button', { text: '加入未来计划', cls: 'tg-task-button-primary', attr: { type: 'button' } });
		save.addEventListener('click', async () => {
			save.disabled = true;
			const result = await this.writer.addTodayInstanceToFuture(this.instance, groupId);
			if (!result.ok) {
				save.disabled = false;
				return void new Notice(result.message, 8000);
			}
			this.close();
			this.onSaved();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
