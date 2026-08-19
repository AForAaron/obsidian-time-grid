import { App, Modal, Notice, setIcon } from 'obsidian';
import { TimerSnapshot } from '../types/timer';
import { TaskTimerStartOutcome, timerStateKey } from '../utils/taskTimer';

interface TaskTimerModalOptions {
	defaultName: string;
	taskWritable: boolean;
	taskAlreadyInProgress: boolean;
	getSnapshot: () => TimerSnapshot;
	start: (name: string) => Promise<TaskTimerStartOutcome>;
	openTimeView: () => void;
}

export class TaskTimerModal extends Modal {
	private options: TaskTimerModalOptions;
	private renderedStateKey = '';
	private input: HTMLInputElement | null = null;
	private submitButton: HTMLButtonElement | null = null;
	private busy = false;

	constructor(app: App, options: TaskTimerModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-timer-modal');
		this.render(this.options.defaultName);
	}

	onClose(): void {
		this.input = null;
		this.submitButton = null;
		this.contentEl.empty();
	}

	private render(value: string, error = ''): void {
		const snapshot = this.options.getSnapshot();
		this.contentEl.empty();
		this.input = null;
		this.submitButton = null;
		this.busy = false;
		if (snapshot.status !== 'idle' && snapshot.status !== 'running') {
			this.renderBlocked(snapshot, error);
			return;
		}

		const running = snapshot.status === 'running' ? snapshot.runningEntries[0] : undefined;
		this.titleEl.setText(running ? '切换任务计时' : '开始任务计时');
		this.renderedStateKey = timerStateKey(snapshot);
		const form = this.contentEl.createEl('form', { cls: 'tg-task-timer-form' });

		if (running) {
			const current = form.createDiv('tg-task-timer-current');
			const icon = current.createSpan('tg-task-timer-current-icon');
			setIcon(icon, 'timer');
			const copy = current.createDiv('tg-task-timer-current-copy');
			copy.createSpan({ cls: 'tg-task-timer-current-label', text: '当前正在计时' });
			copy.createSpan({ cls: 'tg-task-timer-current-name', text: running.name });
			form.createDiv({
				cls: 'tg-task-timer-switch-warning',
				text: '确认后会在同一时刻结束当前活动，并开始新的计时。',
			});
		}

		const field = form.createDiv('tg-task-modal-field');
		field.createEl('label', { text: '计时标题', attr: { for: 'tg-task-timer-name' } });
		this.input = field.createEl('input', {
			cls: 'tg-task-timer-name',
			attr: {
				id: 'tg-task-timer-name',
				type: 'text',
				autocomplete: 'off',
				'aria-label': '计时标题',
			},
		});
		this.input.value = value;

		if (!this.options.taskWritable) {
			form.createDiv({ cls: 'tg-task-timer-note', text: '此任务为只读：计时会正常开始，但不会修改任务状态。' });
		} else if (!this.options.taskAlreadyInProgress) {
			form.createDiv({ cls: 'tg-task-timer-note', text: '计时成功后，这条任务会自动设为“进行中”。' });
		}
		if (snapshot.preparation === 'no-diary') {
			form.createDiv({ cls: 'tg-task-timer-note', text: '开始后将按日记设置创建今日日记。' });
		} else if (snapshot.preparation === 'no-tracker') {
			form.createDiv({ cls: 'tg-task-timer-note', text: '开始后将在今日日记中创建计时记录。' });
		}

		const errorEl = form.createDiv({ cls: `tg-task-modal-error${error ? '' : ' is-hidden'}`, attr: { role: 'alert' } });
		if (error) errorEl.createSpan({ text: error });

		const footer = form.createDiv('tg-task-modal-footer');
		footer.createDiv('tg-task-modal-footer-spacer');
		const cancel = footer.createEl('button', { cls: 'tg-task-modal-button', text: '取消', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		this.submitButton = footer.createEl('button', {
			cls: 'tg-task-modal-button is-primary',
			text: running ? '确认切换' : '开始计时',
			attr: { type: 'submit' },
		});
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.submit();
		});
		window.setTimeout(() => {
			this.input?.focus();
			this.input?.select();
		}, 0);
	}

	private renderBlocked(snapshot: TimerSnapshot, error = ''): void {
		this.titleEl.setText('计时需要处理');
		const diagnostic = this.contentEl.createDiv('tg-task-timer-blocked');
		const icon = diagnostic.createSpan('tg-task-timer-blocked-icon');
		setIcon(icon, 'triangle-alert');
		const copy = diagnostic.createDiv('tg-task-timer-blocked-copy');
		copy.createDiv({ cls: 'tg-task-timer-blocked-title', text: blockedTitle(snapshot) });
		copy.createDiv({ cls: 'tg-task-timer-blocked-message', text: error || snapshot.message || blockedMessage(snapshot) });
		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		footer.createDiv('tg-task-modal-footer-spacer');
		const cancel = footer.createEl('button', { cls: 'tg-task-modal-button', text: '关闭', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const open = footer.createEl('button', { cls: 'tg-task-modal-button is-primary', text: '到时间页处理', attr: { type: 'button' } });
		open.addEventListener('click', () => {
			this.close();
			this.options.openTimeView();
		});
	}

	private async submit(): Promise<void> {
		if (this.busy || !this.input || !this.submitButton) return;
		const name = this.input.value.trim();
		if (!name) {
			this.render(this.input.value, '计时标题不能为空');
			return;
		}
		const latest = this.options.getSnapshot();
		if (timerStateKey(latest) !== this.renderedStateKey) {
			this.render(name, '计时状态刚刚发生变化，请重新确认后再继续');
			return;
		}
		if (latest.status !== 'idle' && latest.status !== 'running') {
			this.render(name, latest.message ?? blockedMessage(latest));
			return;
		}
		const current = latest.status === 'running' ? latest.runningEntries[0] : undefined;
		if (current?.name === name) {
			this.render(name, `“${name}”已经正在计时，无需重复开始`);
			return;
		}

		this.setBusy(true);
		try {
			const outcome = await this.options.start(name);
			if (!outcome.ok) {
				this.render(name, outcome.timerResult.message);
				return;
			}
			if (outcome.statusUpdate === 'update-failed' && outcome.statusResult && !outcome.statusResult.ok) {
				new Notice(`计时已开始，但任务状态未更新：${outcome.statusResult.message}`);
			} else if (outcome.timerResult.switchedFrom) {
				new Notice(`已结束“${outcome.timerResult.switchedFrom}”并开始“${name}”`);
			} else {
				new Notice(`已开始计时“${name}”`);
			}
			this.close();
		} catch (error) {
			this.render(name, String(error));
		} finally {
			this.setBusy(false);
		}
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		if (this.input) this.input.disabled = busy;
		if (this.submitButton) {
			this.submitButton.disabled = busy;
			this.submitButton.setText(busy ? '处理中…' : (this.options.getSnapshot().status === 'running' ? '确认切换' : '开始计时'));
		}
	}
}

function blockedTitle(snapshot: TimerSnapshot): string {
	if (snapshot.status === 'conflict') return '发现多个正在运行的活动';
	if (snapshot.status === 'invalid') return '今日日记中的计时格式异常';
	if (snapshot.status === 'recovery-required') return '需要先处理跨日计时';
	return '当前计时状态不可写入';
}

function blockedMessage(snapshot: TimerSnapshot): string {
	if (snapshot.status === 'conflict') return '结束冲突活动后才能从任务开始新的计时。';
	if (snapshot.status === 'invalid') return '原文不会被自动覆盖，请先检查时间页中的诊断。';
	if (snapshot.status === 'recovery-required') return '确认跨日恢复方式前不会修改任何文件。';
	return '请到时间页重新读取并处理后再试。';
}
