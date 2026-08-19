import { TGTask, WriteResult } from '../types/task';
import { TimerActionResult, TimerSnapshot } from '../types/timer';
import { displayRoutineTitle } from './routineMarker';
import { timerSuggestionName } from './timerController';

export type TaskTimerStatusUpdate = 'unchanged' | 'updated' | 'update-failed';

export type TaskTimerStartOutcome =
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

export function timerStateKey(snapshot: TimerSnapshot): string {
	if (snapshot.status !== 'running') return snapshot.status;
	const running = snapshot.runningEntries[0];
	return running ? `running\u0000${running.name}\u0000${running.startTime}` : 'running';
}

export async function startTaskTimer(
	task: TGTask,
	name: string,
	options: StartTaskTimerOptions
): Promise<TaskTimerStartOutcome> {
	const timerResult = await options.startTimer(name);
	if (!timerResult.ok) return { ok: false, timerResult };
	if (task.status !== 'todo' || !options.canUpdateStatus || !options.setInProgress) {
		return { ok: true, timerResult, statusUpdate: 'unchanged' };
	}
	let statusResult: WriteResult;
	try {
		statusResult = await options.setInProgress();
	} catch (error) {
		statusResult = { ok: false, reason: 'io-error', message: String(error) };
	}
	return statusResult.ok
		? { ok: true, timerResult, statusUpdate: 'updated', statusResult }
		: { ok: true, timerResult, statusUpdate: 'update-failed', statusResult };
}
