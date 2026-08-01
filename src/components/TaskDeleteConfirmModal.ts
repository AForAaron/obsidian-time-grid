import { App, Modal, setIcon } from 'obsidian';
import { TGTask, WriteResult } from '../types/task';

interface TaskDeleteConfirmModalOptions {
	confirm: () => Promise<WriteResult>;
	openSource: () => Promise<void>;
}

export class TaskDeleteConfirmModal extends Modal {
	private task: TGTask;
	private options: TaskDeleteConfirmModalOptions;
	private errorEl: HTMLElement;
	private deleteButton: HTMLButtonElement;

	constructor(app: App, task: TGTask, options: TaskDeleteConfirmModalOptions) {
		super(app);
		this.task = task;
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-delete-modal');
		this.titleEl.setText('删除任务？');
		this.contentEl.createEl('p', {
			cls: 'tg-task-delete-warning',
			text: '只会移除这一行，不会删除子任务或相邻内容。此操作无法从 Time Grid 撤销。',
		});
		this.contentEl.createEl('pre', { cls: 'tg-task-modal-raw', text: this.task.raw });
		const source = this.contentEl.createDiv('tg-task-modal-source');
		const icon = source.createSpan('tg-task-modal-source-icon');
		setIcon(icon, 'file-text');
		source.createSpan({ text: `${this.task.filePath} · 第 ${this.task.line + 1} 行` });
		this.errorEl = this.contentEl.createDiv({ cls: 'tg-task-modal-error is-hidden', attr: { role: 'alert' } });

		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		const openSource = footer.createEl('button', { text: '打开源文件' });
		openSource.addEventListener('click', () => void this.openSourceAndClose());
		footer.createDiv('tg-task-modal-footer-spacer');
		const cancel = footer.createEl('button', { text: '取消' });
		cancel.addEventListener('click', () => this.close());
		this.deleteButton = footer.createEl('button', { cls: 'mod-warning', text: '确认删除' });
		this.deleteButton.addEventListener('click', () => void this.confirmDelete());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async confirmDelete(): Promise<void> {
		this.deleteButton.disabled = true;
		this.deleteButton.setText('删除中...');
		this.errorEl.addClass('is-hidden');
		const result = await this.options.confirm();
		if (result.ok) {
			this.close();
			return;
		}
		this.errorEl.empty();
		this.errorEl.removeClass('is-hidden');
		this.errorEl.createSpan({ text: result.message });
		const copy = this.errorEl.createEl('button', { attr: { type: 'button', 'aria-label': '复制错误信息' } });
		setIcon(copy, 'copy');
		copy.addEventListener('click', () => void navigator.clipboard.writeText(result.message));
		this.deleteButton.disabled = false;
		this.deleteButton.setText('确认删除');
	}

	private async openSourceAndClose(): Promise<void> {
		this.close();
		await this.options.openSource();
	}
}
