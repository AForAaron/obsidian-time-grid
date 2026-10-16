import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { RoutineIndex } from '../utils/routineIndex';
import { RoutineWriter } from '../utils/routineWriter';
import { RoutineItemEditModal } from './RoutineItemEditModal';
import { displayRoutineTitle } from '../utils/routineMarker';

export class RoutineManagerModal extends Modal {
	private index: RoutineIndex;
	private writer: RoutineWriter;
	private getDefinitionPath: () => string;

	constructor(app: App, index: RoutineIndex, writer: RoutineWriter, getDefinitionPath: () => string) {
		super(app);
		this.index = index;
		this.writer = writer;
		this.getDefinitionPath = getDefinitionPath;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-modal', 'tg-routine-manager-modal');
		this.titleEl.setText('管理每日流程');
		this.render();
	}

	private render(): void {
		const body = this.contentEl;
		body.empty();
		const snapshot = this.index.getSnapshot();
		const intro = body.createDiv('tg-routine-manager-intro');
		intro.createDiv({ text: '这里修改的是以后生成的实例；已经存在的日记不会被追溯改写。' });
		intro.createEl('code', { text: this.getDefinitionPath() });
		const toolbar = body.createDiv('tg-routine-manager-toolbar');
		const addGroup = toolbar.createEl('button', { text: '新建组合', cls: 'tg-task-button-primary', attr: { type: 'button' } });
		addGroup.addEventListener('click', () => this.openNewGroupForm());
		if (snapshot.definition.groups.length === 0) {
			body.createDiv({ cls: 'tg-task-empty-body', text: '还没有流程组合。创建一个组合后即可添加项目。' });
			return;
		}

		for (const group of snapshot.definition.groups) {
			const card = body.createDiv(`tg-routine-manager-group${group.enabled ? '' : ' is-disabled'}`);
			const header = card.createDiv('tg-routine-manager-group-header');
			const copy = header.createDiv('tg-routine-manager-group-copy');
			copy.createDiv({ cls: 'tg-routine-manager-group-title', text: group.title });
			if (group.subtitle) copy.createDiv({ cls: 'tg-routine-manager-group-subtitle', text: group.subtitle });
			const actions = header.createDiv('tg-routine-manager-actions');
			this.iconButton(actions, 'arrow-up', '上移组合', () => void this.run(() => this.writer.moveGroup(group.id, -1)));
			this.iconButton(actions, 'arrow-down', '下移组合', () => void this.run(() => this.writer.moveGroup(group.id, 1)));
			this.iconButton(actions, group.enabled ? 'pause' : 'play', group.enabled ? '停用组合' : '启用组合', () => void this.run(() => this.writer.updateGroup(group.id, { enabled: !group.enabled })));
			this.iconButton(actions, 'pencil', '编辑组合', () => this.openEditGroupForm(group.id));
			this.iconButton(actions, 'trash-2', '删除组合', () => void this.confirmDeleteGroup(group.id, group.title), true);

			const list = card.createDiv('tg-routine-manager-items');
			for (const item of group.items) {
				const row = list.createDiv(`tg-routine-manager-item${item.enabled ? '' : ' is-disabled'}`);
				const itemCopy = row.createDiv('tg-routine-manager-item-copy');
				itemCopy.createDiv({ cls: 'tg-routine-manager-item-title', text: displayRoutineTitle(item.title) });
				itemCopy.createDiv({ cls: 'tg-routine-manager-item-schedule', text: scheduleSummary(item) });
				const itemActions = row.createDiv('tg-routine-manager-actions');
				this.iconButton(itemActions, 'arrow-up', '上移项目', () => void this.run(() => this.writer.moveItem(group.id, item.id, -1)));
				this.iconButton(itemActions, 'arrow-down', '下移项目', () => void this.run(() => this.writer.moveItem(group.id, item.id, 1)));
				this.iconButton(itemActions, 'settings-2', '编辑项目计划', () => new RoutineItemEditModal(
					this.app, this.writer, snapshot.definition.groups, group.id, item, () => this.render()
				).open());
				this.iconButton(itemActions, 'trash-2', '删除未来项目', () => void this.confirmDeleteItem(group.id, item.id, item.title), true);
			}
			const addItem = card.createEl('button', { text: '添加项目', cls: 'tg-routine-manager-add-item', attr: { type: 'button' } });
			addItem.addEventListener('click', () => this.openNewItemForm(group.id));
		}
	}

	private openNewGroupForm(): void {
		this.openNameForm('新建组合', '组合名称', async (name) => this.writer.createGroup(name));
	}

	private openEditGroupForm(groupId: string): void {
		const group = this.index.getSnapshot().definition.groups.find((candidate) => candidate.id === groupId);
		if (!group) return;
		this.openNameForm('编辑组合', '组合名称', async (name, subtitle) => this.writer.updateGroup(groupId, { title: name, subtitle }), group.title, group.subtitle);
	}

	private openNewItemForm(groupId: string): void {
		this.openNameForm('新建流程项目', '项目名称', async (name) => this.writer.createItem(groupId, name));
	}

	private openNameForm(
		title: string,
		label: string,
		save: (name: string, subtitle?: string) => Promise<{ ok: boolean }>,
		initial = '',
		initialSubtitle?: string
	): void {
		const modal = new Modal(this.app);
		modal.modalEl.addClass('tg-task-modal');
		modal.titleEl.setText(title);
		let value = initial;
		let subtitle = initialSubtitle ?? '';
		new Setting(modal.contentEl).setName(label).addText((text) => text.setValue(value).onChange((next) => { value = next; }));
		if (title.includes('组合')) new Setting(modal.contentEl).setName('说明').addText((text) => text.setValue(subtitle).onChange((next) => { subtitle = next; }));
		const footer = modal.contentEl.createDiv('tg-task-modal-footer');
		footer.createEl('button', { text: '取消', cls: 'tg-task-button-quiet', attr: { type: 'button' } }).addEventListener('click', () => modal.close());
		const button = footer.createEl('button', { text: '保存', cls: 'tg-task-button-primary', attr: { type: 'button' } });
		button.addEventListener('click', async () => {
			if (!value.trim()) return void new Notice(`${label}不能为空`);
			button.disabled = true;
			const result = await save(value.trim(), subtitle.trim());
			if (!result.ok) { button.disabled = false; return; }
			modal.close();
			this.render();
		});
		modal.open();
	}

	private async confirmDeleteGroup(groupId: string, title: string): Promise<void> {
		if (!window.confirm(`删除组合“${title}”及其未来项目？历史日记不会改变。`)) return;
		await this.run(() => this.writer.deleteGroup(groupId));
	}

	private async confirmDeleteItem(groupId: string, itemId: string, title: string): Promise<void> {
		if (!window.confirm(`停止以后生成“${displayRoutineTitle(title)}”？历史日记不会改变。`)) return;
		await this.run(() => this.writer.deleteItem(groupId, itemId));
	}

	private async run(action: () => Promise<{ ok: boolean }>): Promise<void> {
		const result = await action();
		if (result.ok) this.render();
	}

	private iconButton(parent: HTMLElement, iconName: string, label: string, action: () => void, danger = false): void {
		const button = parent.createEl('button', { cls: `tg-routine-manager-icon${danger ? ' is-danger' : ''}`, attr: { type: 'button', 'aria-label': label, title: label } });
		setIcon(button, iconName);
		button.addEventListener('click', action);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function scheduleSummary(item: { enabled: boolean; schedule: { weekdays: number[]; activeFrom?: string; activeUntil?: string; reminderTime?: string } }): string {
	const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
	const days = item.schedule.weekdays.length === 7 ? '每天' : `周${item.schedule.weekdays.map((day) => dayLabels[day - 1]).join('、')}`;
	const range = item.schedule.activeFrom || item.schedule.activeUntil
		? `${item.schedule.activeFrom ?? '现在'} → ${item.schedule.activeUntil ?? '长期'}`
		: '长期有效';
	return `${item.enabled ? days : '已停用'} · ${range}${item.schedule.reminderTime ? ` · ${item.schedule.reminderTime}` : ''}`;
}
