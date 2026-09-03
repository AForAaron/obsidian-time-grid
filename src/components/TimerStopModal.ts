import { App, Modal, Notice, setIcon } from 'obsidian';
import { TGTask } from '../types/task';
import { TimerSnapshot } from '../types/timer';
import { TaskTimerStopOutcome, taskTimerDefaultName, timerStateKey } from '../utils/taskTimer';
import { formatTimerElapsed } from '../utils/timerFormat';

interface TimerStopModalOptions {
	/** 与当前这段计时关联的任务，已确认可写且未处于终态。 */
	task: TGTask;
	getSnapshot: () => TimerSnapshot;
	/** complete 为 true 时先停计时、成功后再把任务标为完成。 */
	stop: (complete: boolean) => Promise<TaskTimerStopOutcome>;
	openTimeView: () => void;
}

export class TimerStopModal extends Modal {
	private options: TimerStopModalOptions;
	private renderedStateKey = '';
	private buttons: HTMLButtonElement[] = [];
	private busy = false;

	constructor(app: App, options: TimerStopModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass('tg-task-timer-modal');
		this.render();
	}

	onClose(): void {
		this.buttons = [];
		this.contentEl.empty();
	}

	private render(error = ''): void {
		const snapshot = this.options.getSnapshot();
		this.contentEl.empty();
		this.buttons = [];
		this.busy = false;

		if (snapshot.status !== 'running') {
			this.renderBlocked(snapshot, error);
			return;
		}

		this.titleEl.setText('停止计时');
		this.renderedStateKey = timerStateKey(snapshot);
		const running = snapshot.runningEntries[0];

		const current = this.contentEl.createDiv('tg-task-timer-current');
		const icon = current.createSpan('tg-task-timer-current-icon');
		setIcon(icon, 'timer');
		const copy = current.createDiv('tg-task-timer-current-copy');
		copy.createSpan({ cls: 'tg-task-timer-current-label', text: '正在计时' });
		copy.createSpan({ cls: 'tg-task-timer-current-name', text: running.name });
		const elapsed = Math.max(0, Date.now() - Date.parse(running.startTime));
		copy.createSpan({ cls: 'tg-timer-stop-elapsed', text: formatTimerElapsed(elapsed) });

		this.contentEl.createDiv({
			cls: 'tg-timer-stop-task',
			text: `关联任务：${taskTimerDefaultName(this.options.task)}`,
		});
		this.contentEl.createDiv({
			cls: 'tg-task-timer-note',
			text: '选择「停止并完成」会先停止计时，成功后再把这条任务标为完成。',
		});

		const errorEl = this.contentEl.createDiv({
			cls: `tg-task-modal-error${error ? '' : ' is-hidden'}`,
			attr: { role: 'alert' },
		});
		if (error) errorEl.createSpan({ text: error });

		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		footer.createDiv('tg-task-modal-footer-spacer');
		this.addButton(footer, '继续计时', 'tg-task-modal-button', () => this.close());
		this.addButton(footer, '仅停止', 'tg-task-modal-button', () => void this.submit(false));
		this.addButton(footer, '停止并完成', 'tg-task-modal-button is-primary', () => void this.submit(true));
	}

	private renderBlocked(snapshot: TimerSnapshot, error = ''): void {
		this.titleEl.setText(snapshot.status === 'idle' ? '当前没有正在计时' : '计时需要处理');
		const diagnostic = this.contentEl.createDiv('tg-task-timer-blocked');
		const icon = diagnostic.createSpan('tg-task-timer-blocked-icon');
		setIcon(icon, 'triangle-alert');
		const copy = diagnostic.createDiv('tg-task-timer-blocked-copy');
		copy.createDiv({ cls: 'tg-task-timer-blocked-title', text: blockedTitle(snapshot) });
		copy.createDiv({
			cls: 'tg-task-timer-blocked-message',
			text: error || snapshot.message || blockedMessage(snapshot),
		});
		const footer = this.contentEl.createDiv('tg-task-modal-footer');
		footer.createDiv('tg-task-modal-footer-spacer');
		this.addButton(footer, '关闭', 'tg-task-modal-button', () => this.close());
		if (snapshot.status !== 'idle') {
			this.addButton(footer, '到时间页处理', 'tg-task-modal-button is-primary', () => {
				this.close();
				this.options.openTimeView();
			});
		}
	}

	private addButton(parent: HTMLElement, text: string, cls: string, onClick: () => void): void {
		const button = parent.createEl('button', { cls, text, attr: { type: 'button' } });
		button.addEventListener('click', onClick);
		this.buttons.push(button);
	}

	private async submit(complete: boolean): Promise<void> {
		if (this.busy) return;

		// 弹窗打开期间计时可能已被另一个入口切换或停止，提交前必须重读快照。
		const latest = this.options.getSnapshot();
		if (timerStateKey(latest) !== this.renderedStateKey) {
			this.render('计时状态刚刚发生变化，请重新确认后再继续');
			return;
		}

		this.setBusy(true);
		try {
			const outcome = await this.options.stop(complete);
			if (!outcome.ok) {
				this.render(outcome.timerResult.message);
				return;
			}
			if (outcome.statusUpdate === 'update-failed' && outcome.statusResult && !outcome.statusResult.ok) {
				new Notice(`计时已停止，但任务状态未更新：${outcome.statusResult.message}`);
			} else if (outcome.statusUpdate === 'updated') {
				new Notice('计时已停止，任务已标为完成');
			} else {
				new Notice('计时已停止；任务状态保持不变');
			}
			this.close();
		} catch (error) {
			this.render(String(error));
		} finally {
			this.setBusy(false);
		}
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		for (const button of this.buttons) button.disabled = busy;
	}
}

function blockedTitle(snapshot: TimerSnapshot): string {
	if (snapshot.status === 'idle') return '计时已经停止了';
	if (snapshot.status === 'conflict') return '发现多个正在运行的活动';
	if (snapshot.status === 'invalid') return '今日日记中的计时格式异常';
	if (snapshot.status === 'recovery-required') return '需要先处理跨日计时';
	return '当前计时状态不可写入';
}

function blockedMessage(snapshot: TimerSnapshot): string {
	if (snapshot.status === 'idle') return '可能已在其他位置停止，任务状态未被修改。';
	if (snapshot.status === 'conflict') return '请先在时间页结束冲突活动。';
	if (snapshot.status === 'invalid') return '原文不会被自动覆盖，请先检查时间页中的诊断。';
	if (snapshot.status === 'recovery-required') return '确认跨日恢复方式前不会修改任何文件。';
	return '请到时间页重新读取并处理后再试。';
}
