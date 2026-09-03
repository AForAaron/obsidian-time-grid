import { TGTask, WriteResult } from '../types/task';
import { TaskTimerLink, TimerActionResult } from '../types/timer';
import { displayRoutineTitle } from './routineMarker';
import { timerSuggestionName } from './timerFormat';
import { getTaskWriteBlockReason } from './taskWriter';

export { timerStateKey } from './timerFormat';

export type TaskTimerStatusUpdate = 'unchanged' | 'updated' | 'update-failed';

export type TaskTimerStartOutcome =
	| { ok: false; timerResult: Extract<TimerActionResult, { ok: false }> }
	| {
		ok: true;
		timerResult: Extract<TimerActionResult, { ok: true }>;
		statusUpdate: TaskTimerStatusUpdate;
		statusResult?: WriteResult;
		/** 原子切换时「同时把上一个任务标为完成」的结果，未勾选时为 'unchanged'。 */
		previousUpdate: TaskTimerStatusUpdate;
		previousResult?: WriteResult;
	};

export type TaskTimerStopOutcome =
	| { ok: false; timerResult: Extract<TimerActionResult, { ok: false }> }
	| {
		ok: true;
		timerResult: Extract<TimerActionResult, { ok: true }>;
		statusUpdate: TaskTimerStatusUpdate;
		statusResult?: WriteResult;
	};

interface StartTaskTimerOptions {
	startTimer: (name: string) => Promise<TimerActionResult>;
	canUpdateStatus: boolean;
	setInProgress?: () => Promise<WriteResult>;
	/** 仅在用户于切换弹窗勾选「同时标为完成」时传入，作用于被结束的那个任务。 */
	completePrevious?: () => Promise<WriteResult>;
}

interface StopTaskTimerOptions {
	stopTimer: () => Promise<TimerActionResult>;
	/** 仅在用户选择「停止并完成」时传入。 */
	complete?: () => Promise<WriteResult>;
}

export function canStartTimerFromTask(task: TGTask): boolean {
	return task.status === 'todo' || task.status === 'in-progress';
}

export function taskTimerDefaultName(task: TGTask): string {
	const title = task.routine
		? displayRoutineTitle(task.description || task.raw.trim())
		: (task.description || task.raw.trim());
	return timerSuggestionName(title);
}

/**
 * 按与 applyTaskEditToContent 完全相同的「原文在文件内全局唯一」规则重新定位任务。
 * 恰好命中一条才返回；0 条（已删除或改写）或多条（出现重复行）一律返回 null，
 * 宁可丢失关联也不猜错。
 */
export function resolveLinkedTask(link: TaskTimerLink, tasks: TGTask[]): TGTask | null {
	const target = link.raw.trim();
	const matches = tasks.filter((task) => task.filePath === link.filePath && task.raw.trim() === target);
	return matches.length === 1 ? matches[0] : null;
}

/** 关联任务是否还能被标为完成：可写、且尚未处于终态。 */
export function canCompleteLinkedTask(task: TGTask): boolean {
	if (getTaskWriteBlockReason(task) !== null) return false;
	return task.status !== 'done' && task.status !== 'cancelled';
}

export async function startTaskTimer(
	task: TGTask,
	name: string,
	options: StartTaskTimerOptions
): Promise<TaskTimerStartOutcome> {
	const timerResult = await options.startTimer(name);
	if (!timerResult.ok) return { ok: false, timerResult };

	// 计时已经写进日记，之后任何一次状态写入失败都只降级为「部分成功」，绝不回滚计时。
	const previous = options.completePrevious
		? await runStatusWrite(options.completePrevious)
		: null;
	const shouldSetInProgress = task.status === 'todo' && options.canUpdateStatus && Boolean(options.setInProgress);
	const current = shouldSetInProgress && options.setInProgress
		? await runStatusWrite(options.setInProgress)
		: null;

	return {
		ok: true,
		timerResult,
		statusUpdate: current?.update ?? 'unchanged',
		statusResult: current?.result,
		previousUpdate: previous?.update ?? 'unchanged',
		previousResult: previous?.result,
	};
}

/**
 * 停止计时并可选地把关联任务标为完成。
 * 顺序固定：先停计时，成功后才改任务状态；停计时失败时绝不碰任务。
 */
export async function stopTaskTimer(options: StopTaskTimerOptions): Promise<TaskTimerStopOutcome> {
	const timerResult = await options.stopTimer();
	if (!timerResult.ok) return { ok: false, timerResult };
	if (!options.complete) return { ok: true, timerResult, statusUpdate: 'unchanged' };
	const completed = await runStatusWrite(options.complete);
	return { ok: true, timerResult, statusUpdate: completed.update, statusResult: completed.result };
}

async function runStatusWrite(
	write: () => Promise<WriteResult>
): Promise<{ update: TaskTimerStatusUpdate; result: WriteResult }> {
	let result: WriteResult;
	try {
		result = await write();
	} catch (error) {
		result = { ok: false, reason: 'io-error', message: String(error) };
	}
	return { update: result.ok ? 'updated' : 'update-failed', result };
}
