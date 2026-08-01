import { App, Modal, Notice } from 'obsidian';
import { RoutineRepository } from '../utils/routineRepository';
import { RoutineWriter } from '../utils/routineWriter';

export class RoutineMigrationModal extends Modal {
	private repository: RoutineRepository;
	private writer: RoutineWriter;
	private onMigrated: () => void;

	constructor(app: App, repository: RoutineRepository, writer: RoutineWriter, onMigrated: () => void) {
		super(app);
		this.repository = repository;
		this.writer = writer;
		this.onMigrated = onMigrated;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-modal', 'tg-routine-migration-modal');
		this.titleEl.setText('启用每日流程');
		void this.renderPreview();
	}

	private async renderPreview(): Promise<void> {
		const body = this.contentEl;
		body.empty();
		body.createDiv({ cls: 'tg-task-modal-hint', text: '正在检查现有日记模板…' });
		const preview = await this.repository.getMigrationPreview();
		body.empty();
		if (!preview) {
			body.createDiv({ cls: 'tg-task-modal-error', text: '没有找到唯一的旧“每日流程”模板区块。不会修改任何文件。' });
			return;
		}
		body.createDiv({ cls: 'tg-task-modal-hint', text: '确认后自动完成以下操作；历史日记不会修改。' });
		const list = body.createEl('ul', { cls: 'tg-routine-migration-list' });
		list.createEl('li', { text: `从 ${preview.templatePath} 导入 ${preview.taskCount} 个项目` });
		list.createEl('li', { text: `创建 00-Templates/Time Grid Routines.md` });
		list.createEl('li', { text: `备份模板到 ${preview.backupPath}` });
		list.createEl('li', { text: '把模板旧区块替换为 Time Grid 生成槽位' });
		for (const group of preview.groups) {
			const groupEl = body.createDiv('tg-routine-migration-group');
			groupEl.createDiv({ cls: 'tg-routine-migration-group-title', text: group.title });
			for (const item of group.items) groupEl.createDiv({ text: `• ${item.title}` });
		}
		const footer = body.createDiv('tg-task-modal-footer');
		footer.createEl('button', { text: '取消', cls: 'tg-task-button-quiet', attr: { type: 'button' } }).addEventListener('click', () => this.close());
		const confirm = footer.createEl('button', { text: '确认迁移', cls: 'tg-task-button-primary', attr: { type: 'button' } });
		confirm.addEventListener('click', async () => {
			confirm.disabled = true;
			confirm.setText('迁移中…');
			const result = await this.writer.migrate();
			if (!result.ok) {
				confirm.disabled = false;
				confirm.setText('重新尝试');
				return void new Notice(result.message, 8000);
			}
			this.close();
			this.onMigrated();
			new Notice('每日流程迁移完成');
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
