import { App, Modal, Notice } from 'obsidian';
import { TaskPriority, WriteResult } from '../types/task';
import { getTodayKey } from '../utils/taskParser';
import { mountPriorityPicker, PriorityPickerHandle } from './PriorityPicker';

interface TaskCreateModalOptions {
	/** 收件箱路径，仅用于告诉用户任务会落到哪里。 */
	inboxPath: string;
	create: (description: string, due: string | null, priority?: TaskPriority | null) => Promise<WriteResult>;
}

export class TaskCreateModal extends Modal {
	private options: TaskCreateModalOptions;
	private descriptionInput: HTMLTextAreaElement | null = null;
	private dueInput: HTMLInputElement | null = null;
	private priorityPicker: PriorityPickerHandle | null = null;
	private submitButton: HTMLButtonElement | null = null;
	private busy = false;

	constructor(app: App, options: TaskCreateModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-modal', 'tg-task-create-modal');
		this.render();
	}

	onClose(): void {
		this.priorityPicker?.destroy();
		this.priorityPicker = null;
		this.descriptionInput = null;
		this.dueInput = null;
		this.submitButton = null;
		this.contentEl.empty();
	}

	private render(description = '', due = getTodayKey(), priority: TaskPriority | '' = '', error = ''): void {
		this.priorityPicker?.destroy();
		this.priorityPicker = null;
		this.contentEl.empty();
		this.busy = false;
		this.titleEl.setText('新建任务');

		const form = this.contentEl.createEl('form', { cls: 'tg-task-modal-form' });

		const descriptionField = this.createField(form, '内容');
		this.descriptionInput = descriptionField.createEl('textarea', {
			cls: 'tg-task-modal-description',
			attr: { rows: '3', 'aria-label': '任务内容' },
		});
		this.descriptionInput.value = description;

		const dueField = this.createField(form, '到期日');
		this.dueInput = dueField.createEl('input', { type: 'date', attr: { 'aria-label': '任务到期日' } });
		this.dueInput.value = due;
		const quickDates = dueField.createDiv('tg-task-modal-quick-dates');
		for (const [label, days] of [['今天', 0], ['明天', 1], ['下周', 7]] as Array<[string, number]>) {
			const button = quickDates.createEl('button', {
				cls: 'tg-task-modal-button is-quiet',
				text: label,
				attr: { type: 'button' },
			});
			button.addEventListener('click', () => {
				if (this.dueInput) this.dueInput.value = dateAfter(days);
			});
		}
		const clearDate = quickDates.createEl('button', {
			cls: 'tg-task-modal-button is-quiet',
			text: '清除',
			attr: { type: 'button' },
		});
		clearDate.addEventListener('click', () => {
			if (this.dueInput) this.dueInput.value = '';
		});

		const priorityField = this.createField(form, '优先级');
		this.priorityPicker = mountPriorityPicker(priorityField, priority, { ariaLabel: '任务优先级' });

		form.createDiv({
			cls: 'tg-task-modal-hint',
			text: `新任务会写入「${this.options.inboxPath}」，默认到期日是今天。`,
		});

		const errorEl = form.createDiv({
			cls: `tg-task-modal-error${error ? '' : ' is-hidden'}`,
			attr: { role: 'alert' },
		});
		if (error) errorEl.createSpan({ text: error });

		const footer = form.createDiv('tg-task-modal-footer');
		footer.createDiv('tg-task-modal-footer-spacer');
		const cancel = footer.createEl('button', { cls: 'tg-task-modal-button', text: '取消', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		this.submitButton = footer.createEl('button', {
			cls: 'tg-task-modal-button is-primary',
			text: '创建',
			attr: { type: 'submit' },
		});

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.submit();
		});
		window.setTimeout(() => this.descriptionInput?.focus(), 0);
	}

	private createField(parent: HTMLElement, label: string): HTMLElement {
		const field = parent.createDiv('tg-task-modal-field');
		field.createEl('label', { text: label });
		return field;
	}

	private async submit(): Promise<void> {
		if (this.busy || !this.descriptionInput || !this.dueInput || !this.priorityPicker) return;
		const description = this.descriptionInput.value;
		const due = this.dueInput.value;
		const priority = this.priorityPicker.getValue();
		if (!description.trim()) {
			this.render(description, due, priority, '任务内容不能为空');
			return;
		}

		this.setBusy(true);
		try {
			const result = await this.options.create(description, due || null, priority || null);
			if (!result.ok) {
				// 失败时保持弹窗打开，内容不丢，错误可复制。
				this.render(description, due, priority, result.message);
				return;
			}
			new Notice(`已新建任务「${description.trim()}」`);
			this.close();
		} catch (error) {
			this.render(description, due, priority, String(error));
		} finally {
			this.setBusy(false);
		}
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		if (this.descriptionInput) this.descriptionInput.disabled = busy;
		if (this.dueInput) this.dueInput.disabled = busy;
		this.priorityPicker?.setDisabled(busy);
		if (this.submitButton) {
			this.submitButton.disabled = busy;
			this.submitButton.setText(busy ? '创建中…' : '创建');
		}
	}
}

function dateAfter(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return getTodayKey(date);
}
