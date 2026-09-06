import { App, Modal, setIcon } from 'obsidian';
import { TaskPatch, TaskPriority, TaskSettings, TGTask, WriteResult } from '../types/task';
import { getTodayKey } from '../utils/taskParser';
import { getTaskWriteBlockReason } from '../utils/taskWriter';
import { TaskDeleteConfirmModal } from './TaskDeleteConfirmModal';
import { mountPriorityPicker, PriorityPickerHandle } from './PriorityPicker';

interface TaskEditModalOptions {
	getSettings: () => TaskSettings;
	save: (patch: TaskPatch) => Promise<WriteResult>;
	deleteTask: () => Promise<WriteResult>;
	skipRoutine?: () => Promise<WriteResult>;
	openSource: () => Promise<void>;
}

export class TaskEditModal extends Modal {
	private task: TGTask;
	private options: TaskEditModalOptions;
	private descriptionInput: HTMLTextAreaElement | null = null;
	private dueInput: HTMLInputElement | null = null;
	private priorityPicker: PriorityPickerHandle | null = null;
	private goalInput: HTMLInputElement | null = null;
	private reminderInput: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;
	private saveButton: HTMLButtonElement | null = null;

	constructor(app: App, task: TGTask, options: TaskEditModalOptions) {
		super(app);
		this.task = task;
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-edit-modal');
		this.titleEl.setText(this.task.routine ? '编辑今天的流程' : '编辑任务');
		const blocked = getTaskWriteBlockReason(this.task);
		if (blocked) this.renderReadOnly(blocked);
		else this.renderForm();
	}

	onClose(): void {
		this.priorityPicker?.destroy();
		this.priorityPicker = null;
		this.contentEl.empty();
	}

	private renderReadOnly(reason: string): void {
		this.contentEl.createDiv({ cls: 'tg-task-modal-diagnostic', text: reason });
		this.contentEl.createEl('pre', { cls: 'tg-task-modal-raw', text: this.task.raw });
		this.renderSourceInfo();
		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		const source = footer.createEl('button', { cls: 'tg-task-modal-button is-primary', text: '打开源文件' });
		source.addEventListener('click', () => void this.openSourceAndClose());
		const close = footer.createEl('button', { cls: 'tg-task-modal-button', text: '关闭' });
		close.addEventListener('click', () => this.close());
	}

	private renderForm(): void {
		const form = this.contentEl.createEl('form', { cls: 'tg-task-modal-form' });
		const descriptionField = this.createField(form, '描述');
		this.descriptionInput = descriptionField.createEl('textarea', {
			cls: 'tg-task-modal-description',
			attr: { rows: '3', 'aria-label': '任务描述' },
		});
		this.descriptionInput.value = this.task.description;

		if (!this.task.routine) {
			const dueField = this.createField(form, '到期日');
			this.dueInput = dueField.createEl('input', { type: 'date', attr: { 'aria-label': '任务到期日' } });
			this.dueInput.value = this.task.due ?? '';
			const quickDates = dueField.createDiv('tg-task-modal-quick-dates');
			for (const [label, days] of [['今天', 0], ['明天', 1], ['下周', 7]] as Array<[string, number]>) {
				const button = quickDates.createEl('button', { cls: 'tg-task-modal-button is-quiet', text: label, attr: { type: 'button' } });
				button.addEventListener('click', () => {
					if (this.dueInput) this.dueInput.value = dateAfter(days);
				});
			}
			const clearDate = quickDates.createEl('button', { cls: 'tg-task-modal-button is-quiet', text: '清除', attr: { type: 'button' } });
			clearDate.addEventListener('click', () => { if (this.dueInput) this.dueInput.value = ''; });
		}

		const priorityField = this.createField(form, '优先级');
		this.priorityPicker = mountPriorityPicker(priorityField, this.task.priority ?? '', { ariaLabel: '任务优先级' });

		if (this.task.routine) {
			const reminderField = this.createField(form, '今天提醒时间');
			this.reminderInput = reminderField.createEl('input', { type: 'time', attr: { 'aria-label': '今天提醒时间' } });
			this.reminderInput.value = this.task.routine.reminderTime ?? '';
		} else {
			const goalField = this.createField(form, '长期任务', 'tg-task-modal-switch-field');
			const goalControl = goalField.createEl('label', { cls: 'tg-task-modal-switch' });
			this.goalInput = goalControl.createEl('input', { type: 'checkbox', attr: { 'aria-label': '设为长期任务' } });
			this.goalInput.checked = hasGoalTag(this.task, this.options.getSettings().goalTag);
			goalControl.createSpan({ text: this.options.getSettings().goalTag });
		}

		this.renderSourceInfo(form);
		this.errorEl = form.createDiv({ cls: 'tg-task-modal-error is-hidden', attr: { role: 'alert' } });

		const footer = form.createDiv('tg-task-modal-footer');
		const deleteButton = footer.createEl('button', {
			cls: 'tg-task-modal-button is-danger',
			text: this.task.routine ? '跳过今天' : '删除',
			attr: { type: 'button' },
		});
		deleteButton.addEventListener('click', () => this.task.routine ? void this.skipRoutine() : this.openDeleteConfirmation());
		const source = footer.createEl('button', { cls: 'tg-task-modal-button', text: '打开源文件', attr: { type: 'button' } });
		source.addEventListener('click', () => void this.openSourceAndClose());
		const spacer = footer.createDiv('tg-task-modal-footer-spacer');
		const cancel = footer.createEl('button', { cls: 'tg-task-modal-button', text: '取消', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		this.saveButton = footer.createEl('button', { cls: 'tg-task-modal-button is-primary', text: '保存', attr: { type: 'submit' } });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.save();
		});

		window.setTimeout(() => {
			this.descriptionInput?.focus();
			this.descriptionInput?.select();
		}, 0);
	}

	private createField(parent: HTMLElement, label: string, cls = ''): HTMLElement {
		const field = parent.createDiv(`tg-task-modal-field ${cls}`.trim());
		field.createEl('label', { text: label });
		return field;
	}

	private renderSourceInfo(parent = this.contentEl): void {
		const source = parent.createDiv('tg-task-modal-source');
		const icon = source.createSpan('tg-task-modal-source-icon');
		setIcon(icon, 'file-text');
		source.createSpan({ text: `${this.task.filePath} · 第 ${this.task.line + 1} 行` });
	}

	private async save(): Promise<void> {
		if (!this.descriptionInput || !this.priorityPicker || !this.saveButton) return;
		if (!this.task.routine && (!this.dueInput || !this.goalInput)) return;
		const description = this.descriptionInput.value.trim();
		if (!description) {
			this.showError('任务描述不能为空');
			this.descriptionInput.focus();
			return;
		}
		this.saveButton.disabled = true;
		this.saveButton.setText('保存中...');
		this.hideError();
		const priority = (this.priorityPicker.getValue() || null) as TaskPriority | null;
		const result = await this.options.save(this.task.routine ? {
			description,
			priority,
			routineReminderTime: this.reminderInput?.value || null,
		} : {
			description,
			due: this.dueInput!.value || null,
			priority,
			goal: this.goalInput!.checked,
		});
		if (result.ok) {
			this.close();
			return;
		}
		this.showError(result.message);
		this.saveButton.disabled = false;
		this.saveButton.setText('保存');
	}

	private showError(message: string): void {
		if (!this.errorEl) return;
		this.errorEl.empty();
		this.errorEl.removeClass('is-hidden');
		this.errorEl.createSpan({ text: message });
		const copy = this.errorEl.createEl('button', { attr: { type: 'button', 'aria-label': '复制错误信息' } });
		setIcon(copy, 'copy');
		copy.addEventListener('click', () => void navigator.clipboard.writeText(message));
	}

	private hideError(): void {
		this.errorEl?.addClass('is-hidden');
	}

	private async openSourceAndClose(): Promise<void> {
		this.close();
		await this.options.openSource();
	}

	private openDeleteConfirmation(): void {
		this.close();
		new TaskDeleteConfirmModal(this.app, this.task, {
			confirm: this.options.deleteTask,
			openSource: this.options.openSource,
		}).open();
	}

	private async skipRoutine(): Promise<void> {
		if (!this.options.skipRoutine) return;
		const result = await this.options.skipRoutine();
		if (result.ok) this.close();
		else this.showError(result.message);
	}
}

function dateAfter(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return getTodayKey(date);
}

function hasGoalTag(task: TGTask, goalTag: string): boolean {
	const expected = goalTag.trim().toLocaleLowerCase();
	return task.tags.some((tag) => tag.toLocaleLowerCase() === expected);
}
