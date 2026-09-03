import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	classifyTask,
	getTaskStatusKind,
	hasMeaningfulTaskDescription,
	isPathExcluded,
	parseTaskLine,
	sortTasks,
} from '../src/utils/taskParser';
import { DEFAULT_TASK_SETTINGS } from '../src/types/task';
import { applyTaskEditToContent, getTaskWriteBlockReason, serializeStatusChange, serializeTaskPatch, shiftDateKey } from '../src/utils/taskWriter';
import { getEffectiveWritingDelta, normalizeTimeGridData } from '../src/utils/writingStats';
import { countFilteredSections, createEmptyTaskFilters, filterTasks, groupFutureTasks, hasActiveTaskFilters } from '../src/utils/taskView';
import { getRoutineProgress, getTaskMenuActions, positionFloatingLayer } from '../src/utils/taskUi';
import { canCompleteLinkedTask, canStartTimerFromTask, resolveLinkedTask, startTaskTimer, stopTaskTimer, taskTimerDefaultName, timerStateKey } from '../src/utils/taskTimer';
import {
	appendTaskToInbox,
	collidesWithExistingLine,
	createInboxScaffold,
	ensureTaskSlot,
	findTaskSlot,
	generateTaskId,
	insertTaskLine,
	serializeNewTaskLine,
	TASK_SLOT_END,
	TASK_SLOT_START,
} from '../src/utils/taskInbox';
import {
	activeRoutineGroups,
	adoptLegacyRoutineInstances,
	getRoutineTaskLineNumbers,
	insertRoutineInstancesAtSlot,
	parseRoutineDocument,
	parseRoutineInstances,
	previousDateKey,
	replaceLegacyRoutineWithSlot,
	routineDocumentFromLegacy,
	serializeRoutineDocument,
} from '../src/utils/routineFormat';
import { RoutineDocument } from '../src/types/routine';
import { isRoutineReminderDue, reminderKey } from '../src/utils/routineReminder';
import { parseSimpleTimeTracker } from '../src/utils/dailyNotesParser';
import { timerSuggestionName } from '../src/utils/timerController';
import {
	closeTimerByIdentity,
	ensureTrackerBlock,
	inspectTimerContent,
	startTimerInContent,
	stopTimerInContent,
	TIMER_SLOT_END,
	TIMER_SLOT_START,
	upsertTimerSegment,
} from '../src/utils/timerFormat';

let passed = 0;
const asyncTests: Array<{ name: string; fn: () => Promise<void> }> = [];

function test(name: string, fn: () => void): void {
	try {
		fn();
		passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		console.error(`✗ ${name}`);
		throw error;
	}
}

function testAsync(name: string, fn: () => Promise<void>): void {
	asyncTests.push({ name, fn });
}

test('parses Tasks emoji fields without requiring a preceding space', () => {
	const task = parseTaskLine('- [ ] 给妈妈写论文📅 2026-02-28 ⏫', 'Inbox.md', 2, '2026-08-01', '#goal');
	assert.equal(task.description, '给妈妈写论文');
	assert.equal(task.due, '2026-02-28');
	assert.equal(task.priority, 'high');
	assert.equal(task.section, 'overdue');
	assert.equal(task.diagnostics.length, 0);
});

test('preserves callout and ordered-list prefixes', () => {
	const task = parseTaskLine('>   1. [/] 正在处理 📅 2026-08-01', 'Project.md', 4, '2026-08-01', '#goal');
	assert.equal(task.indent, '>   1. [');
	assert.equal(task.status, 'in-progress');
	assert.equal(task.description, '正在处理');
	assert.equal(task.section, 'today');
});

test('maps the four supported status characters', () => {
	assert.equal(getTaskStatusKind(' '), 'todo');
	assert.equal(getTaskStatusKind('/'), 'in-progress');
	assert.equal(getTaskStatusKind('x'), 'done');
	assert.equal(getTaskStatusKind('-'), 'cancelled');
	assert.equal(getTaskStatusKind('?'), 'unknown');
});

test('empty and date-only checkboxes are not meaningful tasks', () => {
	const empty = parseTaskLine('- [ ] ', 'Daily.md', 0, '2026-08-02', '#goal');
	const metadataOnly = parseTaskLine('- [ ] 📅 2026-08-02 ⏫', 'Daily.md', 1, '2026-08-02', '#goal');
	const dateOnly = parseTaskLine('- [ ] 2026-02-25', 'Daily.md', 2, '2026-08-02', '#goal');
	const datedAction = parseTaskLine('- [ ] 2026-02-25 复盘', 'Daily.md', 3, '2026-08-02', '#goal');
	assert.equal(hasMeaningfulTaskDescription(empty.description), false);
	assert.equal(hasMeaningfulTaskDescription(metadataOnly.description), false);
	assert.equal(hasMeaningfulTaskDescription(dateOnly.description), false);
	assert.equal(hasMeaningfulTaskDescription(datedAction.description), true);
});

test('keeps unknown statuses visible but blocking', () => {
	const task = parseTaskLine('- [?] 等待确认', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(task.status, 'unknown');
	assert.equal(task.section, 'unsorted');
	assert.equal(task.diagnostics[0]?.code, 'unknown-status');
	assert.equal(task.diagnostics[0]?.blocking, true);
});

test('classifies cancelled tasks as terminal and goal before due', () => {
	const cancelled = parseTaskLine('- [-] 放弃 ❌ 2026-08-01', 'Inbox.md', 0, '2026-08-01', '#goal');
	const goal = parseTaskLine('- [ ] 长期方向 #goal 📅 2025-01-01', 'Inbox.md', 1, '2026-08-01', '#goal');
	assert.equal(cancelled.section, 'done');
	assert.equal(goal.section, 'goal');
	assert.equal(classifyTask(goal, '2026-08-02', '#goal'), 'goal');
});

test('marks invalid and duplicate date fields as blocking', () => {
	const task = parseTaskLine('- [ ] 坏日期 📅 2026-02-31 📅 2026-08-01', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(task.diagnostics.some((item) => item.code === 'invalid-date'), true);
	assert.equal(task.diagnostics.some((item) => item.code === 'duplicate-field'), true);
});

test('recognises recurrence while retaining the opaque suffix', () => {
	const task = parseTaskLine('- [ ] 周报 🔁 every week 🆔 abc123', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(task.hasRecurrence, true);
	assert.equal(task.description, '周报');
	assert.equal(task.trailing[0], '🔁 every week 🆔 abc123');
});

test('matches excluded paths on root-relative segment boundaries', () => {
	assert.equal(isPathExcluded('00-Templates/Daily.md', '00-Templates'), true);
	assert.equal(isPathExcluded('00-Templates-old/Daily.md', '00-Templates'), false);
	assert.equal(isPathExcluded('Projects/A/00-Templates/X.md', '00-Templates'), false);
	assert.equal(isPathExcluded('Projects/A/Private.md', '00-Templates, Projects/A'), true);
});

test('sorts today tasks by priority descending', () => {
	const low = parseTaskLine('- [ ] 低 🔽 📅 2026-08-01', 'B.md', 0, '2026-08-01', '#goal');
	const high = parseTaskLine('- [ ] 高 ⏫ 📅 2026-08-01', 'A.md', 0, '2026-08-01', '#goal');
	assert.deepEqual(sortTasks('today', [low, high]).map((task) => task.description), ['高', '低']);
});

test('serializes terminal status and normalizes missing metadata spacing', () => {
	const task = parseTaskLine('- [ ] 写论文📅 2026-08-05 🆔 abc', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeStatusChange(task, 'done', DEFAULT_TASK_SETTINGS, '2026-08-01');
	assert.equal(raw, '- [x] 写论文 📅 2026-08-05 🆔 abc ✅ 2026-08-01');
});

test('switching to cancelled replaces done metadata and reopening removes terminal dates', () => {
	const done = parseTaskLine('- [x] 完成了 📅 2026-08-05 ✅ 2026-07-31', 'Inbox.md', 0, '2026-08-01', '#goal');
	const cancelledRaw = serializeStatusChange(done, 'cancelled', DEFAULT_TASK_SETTINGS, '2026-08-01');
	assert.equal(cancelledRaw, '- [-] 完成了 📅 2026-08-05 ❌ 2026-08-01');
	const cancelled = parseTaskLine(cancelledRaw, 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(serializeStatusChange(cancelled, 'todo', DEFAULT_TASK_SETTINGS, '2026-08-01'), '- [ ] 完成了 📅 2026-08-05');
});

test('content editing preserves CRLF, BOM and final newline', () => {
	const content = '\uFEFF# Inbox\r\n- [ ] Alpha\r\nTail\r\n';
	const task = parseTaskLine('- [ ] Alpha', 'Inbox.md', 1, '2026-08-01', '#goal');
	const edit = applyTaskEditToContent(content, task, '- [x] Alpha ✅ 2026-08-01');
	assert.equal(edit.result.ok, true);
	assert.equal(edit.content, '\uFEFF# Inbox\r\n- [x] Alpha ✅ 2026-08-01\r\nTail\r\n');
});

test('line drift uses the unique exact raw match', () => {
	const task = parseTaskLine('- [ ] Alpha', 'Inbox.md', 8, '2026-08-01', '#goal');
	const edit = applyTaskEditToContent('Heading\n- [ ] Alpha\n', task, '- [x] Alpha');
	assert.deepEqual(edit, { content: 'Heading\n- [x] Alpha\n', result: { ok: true } });
});

test('duplicate raw tasks are always rejected even when the original line still matches', () => {
	const task = parseTaskLine('- [ ] Same', 'Inbox.md', 0, '2026-08-01', '#goal');
	const content = '- [ ] Same\n- [ ] Same\n';
	const edit = applyTaskEditToContent(content, task, '- [x] Same');
	assert.equal(edit.result.ok, false);
	if (!edit.result.ok) assert.equal(edit.result.reason, 'line-mismatch-ambiguous');
	assert.equal(edit.content, content);
});

test('deleting a final line preserves the absence of a terminal newline', () => {
	const task = parseTaskLine('- [ ] Last', 'Inbox.md', 1, '2026-08-01', '#goal');
	const edit = applyTaskEditToContent('First\n- [ ] Last', task, null);
	assert.equal(edit.content, 'First');
});

test('record-terminal-date off changes only the checkbox and removes terminal dates', () => {
	const task = parseTaskLine('- [x] Alpha ✅ 2026-07-31 🆔 keep', 'Inbox.md', 0, '2026-08-01', '#goal');
	const settings = { ...DEFAULT_TASK_SETTINGS, recordTerminalDate: false };
	assert.equal(serializeStatusChange(task, 'cancelled', settings, '2026-08-01'), '- [-] Alpha 🆔 keep');
});

test('recurring and malformed tasks expose blocking write reasons', () => {
	const recurring = parseTaskLine('- [ ] Repeat 🔁 every day 📅 2026-08-01', 'Inbox.md', 0, '2026-08-01', '#goal');
	const malformed = parseTaskLine('- [ ] Invalid 📅 2026-13-01', 'Inbox.md', 1, '2026-08-01', '#goal');
	assert.match(getTaskWriteBlockReason(recurring) ?? '', /循环任务/);
	assert.match(getTaskWriteBlockReason(malformed) ?? '', /日期无效/);
});

test('not-found edits return the original content unchanged', () => {
	const task = parseTaskLine('- [ ] Missing', 'Inbox.md', 0, '2026-08-01', '#goal');
	const content = '- [ ] Present\n';
	const edit = applyTaskEditToContent(content, task, '- [x] Missing');
	assert.equal(edit.result.ok, false);
	if (!edit.result.ok) assert.equal(edit.result.reason, 'line-mismatch-not-found');
	assert.equal(edit.content, content);
});

test('deleting a middle line preserves adjacent lines and separators', () => {
	const task = parseTaskLine('- [ ] Middle', 'Inbox.md', 1, '2026-08-01', '#goal');
	const edit = applyTaskEditToContent('First\r\n- [ ] Middle\r\nLast\r\n', task, null);
	assert.equal(edit.content, 'First\r\nLast\r\n');
});

test('status edits preserve unknown metadata ordering and text', () => {
	const task = parseTaskLine('- [/] Work 🆔 abc custom-tail ⛔ dep 📅 2026-08-02', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeStatusChange(task, 'done', DEFAULT_TASK_SETTINGS, '2026-08-01');
	assert.equal(raw, '- [x] Work 🆔 abc custom-tail ⛔ dep 📅 2026-08-02 ✅ 2026-08-01');
});

test('task-write suppression preserves concurrent external writing deltas', () => {
	assert.equal(getEffectiveWritingDelta(6, 1), 5);
	assert.equal(getEffectiveWritingDelta(-3, -1), -2);
});

test('task patch edits selected fields while preserving opaque metadata text and order', () => {
	const task = parseTaskLine('- [ ] Old 🆔 abc custom ⛔ dep 📅 2026-08-02 🔽', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeTaskPatch(task, {
		description: 'New',
		due: '2026-08-10',
		priority: 'high',
		goal: true,
	}, DEFAULT_TASK_SETTINGS);
	assert.equal(raw, '- [ ] New #goal 🆔 abc custom ⛔ dep 📅 2026-08-10 ⏫');
});

test('task patch can clear due priority and long-term tag without moving unknown fields', () => {
	const task = parseTaskLine('- [ ] Project #goal 📅 2026-08-02 ⏫ 🆔 keep', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeTaskPatch(task, { due: null, priority: null, goal: false }, DEFAULT_TASK_SETTINGS);
	assert.equal(raw, '- [ ] Project 🆔 keep');
});

test('task patch can add due and priority fields to a plain task', () => {
	const task = parseTaskLine('- [ ] Plain', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeTaskPatch(task, { due: '2026-08-09', priority: 'medium' }, DEFAULT_TASK_SETTINGS);
	assert.equal(raw, '- [ ] Plain 🔼 📅 2026-08-09');
});

test('removing a long-term tag after opaque metadata preserves the remaining suffix', () => {
	const task = parseTaskLine('- [ ] Work 🆔 abc #goal', 'Inbox.md', 0, '2026-08-01', '#goal');
	const raw = serializeTaskPatch(task, { goal: false }, DEFAULT_TASK_SETTINGS);
	assert.equal(raw, '- [ ] Work 🆔 abc');
});

test('date shifting handles month year and leap-day boundaries', () => {
	assert.equal(shiftDateKey('2026-08-31', 1), '2026-09-01');
	assert.equal(shiftDateKey('2026-12-31', 7), '2027-01-07');
	assert.equal(shiftDateKey('2028-02-28', 1), '2028-02-29');
});

test('deleting a parent task line keeps its child and adjacent content', () => {
	const task = parseTaskLine('- [ ] Parent', 'Inbox.md', 1, '2026-08-01', '#goal');
	const content = 'Heading\n- [ ] Parent\n  - [ ] Child\nTail\n';
	const edit = applyTaskEditToContent(content, task, null);
	assert.equal(edit.content, 'Heading\n  - [ ] Child\nTail\n');
});

test('quick classification patches only due or long-term state', () => {
	const task = parseTaskLine('- [ ] Inbox item 🆔 keep', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(
		serializeTaskPatch(task, { due: '2026-08-01' }, DEFAULT_TASK_SETTINGS),
		'- [ ] Inbox item 🆔 keep 📅 2026-08-01'
	);
	assert.equal(
		serializeTaskPatch(task, { goal: true }, DEFAULT_TASK_SETTINGS),
		'- [ ] Inbox item #goal 🆔 keep'
	);
});

test('task search matches description tags and source path case-insensitively', () => {
	const tasks = [
		parseTaskLine('- [ ] Prepare Launch #Work 📅 2026-08-02', 'Projects/Alpha.md', 0, '2026-08-01', '#goal'),
		parseTaskLine('- [ ] 买牛奶 📅 2026-08-02', 'Personal/Home.md', 0, '2026-08-01', '#goal'),
	];
	const filters = createEmptyTaskFilters();
	filters.query = 'launch';
	assert.deepEqual(filterTasks(tasks, filters).map((task) => task.filePath), ['Projects/Alpha.md']);
	filters.query = '#WORK';
	assert.equal(filterTasks(tasks, filters).length, 1);
	filters.query = 'personal/home';
	assert.deepEqual(filterTasks(tasks, filters).map((task) => task.description), ['买牛奶']);
});

test('task filters use OR within a category and AND between categories', () => {
	const tasks = [
		parseTaskLine('- [ ] A ⏫ 📅 2026-08-01', 'One.md', 0, '2026-08-01', '#goal'),
		parseTaskLine('- [/] B 🔽 📅 2026-08-01', 'One.md', 1, '2026-08-01', '#goal'),
		parseTaskLine('- [/] C ⏫ 📅 2026-08-01', 'Two.md', 0, '2026-08-01', '#goal'),
	];
	const filters = createEmptyTaskFilters();
	filters.statuses.add('todo');
	filters.statuses.add('in-progress');
	filters.priorities.add('high');
	filters.sources.add('One.md');
	assert.deepEqual(filterTasks(tasks, filters).map((task) => task.description), ['A']);
	filters.priorities.add('low');
	assert.deepEqual(filterTasks(tasks, filters).map((task) => task.description), ['A', 'B']);
	assert.equal(hasActiveTaskFilters(filters), true);
});

test('filtered section counts retain matching and total values', () => {
	const tasks = [
		parseTaskLine('- [ ] Today A 📅 2026-08-01', 'One.md', 0, '2026-08-01', '#goal'),
		parseTaskLine('- [ ] Today B 📅 2026-08-01', 'Two.md', 0, '2026-08-01', '#goal'),
		parseTaskLine('- [ ] Future 📅 2026-08-02', 'One.md', 1, '2026-08-01', '#goal'),
	];
	const counts = countFilteredSections(tasks, [tasks[0]]);
	assert.equal(counts.filtered.today, 1);
	assert.equal(counts.total.today, 2);
	assert.equal(counts.filtered.future ?? 0, 0);
	assert.equal(counts.total.future, 1);
});

test('future tasks split into tomorrow seven-day and later groups', () => {
	const tasks = [
		parseTaskLine('- [ ] Tomorrow 📅 2026-08-02', 'One.md', 0, '2026-08-01', '#goal'),
		parseTaskLine('- [ ] Soon 📅 2026-08-08', 'One.md', 1, '2026-08-01', '#goal'),
		parseTaskLine('- [ ] Later 📅 2026-08-09', 'One.md', 2, '2026-08-01', '#goal'),
	];
	const groups = groupFutureTasks(tasks, '2026-08-01');
	assert.deepEqual(groups.tomorrow.map((task) => task.description), ['Tomorrow']);
	assert.deepEqual(groups.next7.map((task) => task.description), ['Soon']);
	assert.deepEqual(groups.later.map((task) => task.description), ['Later']);
});

test('view state migration defaults old data to time and preserves a saved tasks mode', () => {
	assert.equal(normalizeTimeGridData({}).uiState.activeMode, 'time');
	assert.equal(normalizeTimeGridData({ uiState: { activeMode: 'tasks' } }).uiState.activeMode, 'tasks');
	assert.equal(normalizeTimeGridData({ uiState: { activeMode: 'invalid' } }).uiState.activeMode, 'time');
	assert.equal(normalizeTimeGridData({}).uiState.timeRange, '6m');
	assert.equal(normalizeTimeGridData({ uiState: { timeRange: '3m' } }).uiState.timeRange, '3m');
	assert.equal(normalizeTimeGridData({ uiState: { timeRange: 'bad' } }).uiState.timeRange, '6m');
	assert.equal(normalizeTimeGridData({}).timerRecovery.active, null);
	assert.deepEqual(
		normalizeTimeGridData({
			timerRecovery: { active: { name: '阅读', startTime: '2026-08-01T14:00:00.000Z', sourceDate: '2026-08-01' } },
		}).timerRecovery.active,
		{ name: '阅读', startTime: '2026-08-01T14:00:00.000Z', sourceDate: '2026-08-01' }
	);
	assert.equal(
		normalizeTimeGridData({
			timerRecovery: { active: { name: '  ', startTime: 'bad', sourceDate: '08-01' } },
		}).timerRecovery.active,
		null
	);
});

test('floating layers prefer the requested side when it fits', () => {
	const position = positionFloatingLayer(
		{ left: 100, top: 80, right: 160, bottom: 110, width: 60, height: 30 },
		{ width: 180, height: 120 },
		{ width: 800, height: 600 },
		'right'
	);
	assert.deepEqual(position, { left: 166, top: 80, placement: 'right' });
});

test('floating layers flip and remain inside viewport margins', () => {
	const flipped = positionFloatingLayer(
		{ left: 740, top: 540, right: 790, bottom: 580, width: 50, height: 40 },
		{ width: 220, height: 180 },
		{ width: 800, height: 600 },
		'bottom'
	);
	assert.equal(flipped.placement, 'top');
	assert.equal(flipped.left, 570);
	assert.equal(flipped.top, 354);
	const oversized = positionFloatingLayer(
		{ left: 2, top: 2, right: 20, bottom: 20, width: 18, height: 18 },
		{ width: 500, height: 500 },
		{ width: 320, height: 240 },
		'right'
	);
	assert.equal(oversized.left, 10);
	assert.equal(oversized.top, 10);
});

test('task menus expose only safe actions for readonly tasks', () => {
	const readonly = parseTaskLine('- [ ] Loop 🔁 every day', 'Daily.md', 0, '2026-08-01', '#goal');
	assert.deepEqual(getTaskMenuActions(readonly, false), ['show-readonly-reason', 'open-source']);
	assert.deepEqual(getTaskMenuActions(readonly, false, true), ['start-timer', 'show-readonly-reason', 'open-source']);
});

test('task menus vary scheduling actions by task shape', () => {
	const dated = parseTaskLine('- [ ] Dated 📅 2026-08-01', 'Daily.md', 0, '2026-08-01', '#goal');
	const inbox = parseTaskLine('- [ ] Inbox', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.deepEqual(getTaskMenuActions(dated, true), ['edit', 'postpone-day', 'postpone-week', 'open-source', 'delete']);
	assert.deepEqual(getTaskMenuActions(inbox, true), ['edit', 'set-today', 'set-long-term', 'open-source', 'delete']);
	assert.deepEqual(getTaskMenuActions(inbox, true, true), ['start-timer', 'edit', 'set-today', 'set-long-term', 'open-source', 'delete']);
});

test('task timer eligibility excludes terminal and unknown states', () => {
	const todo = parseTaskLine('- [ ] Todo', 'Inbox.md', 0, '2026-08-01', '#goal');
	const progress = parseTaskLine('- [/] Progress', 'Inbox.md', 1, '2026-08-01', '#goal');
	const done = parseTaskLine('- [x] Done', 'Inbox.md', 2, '2026-08-01', '#goal');
	const cancelled = parseTaskLine('- [-] Cancelled', 'Inbox.md', 3, '2026-08-01', '#goal');
	const unknown = parseTaskLine('- [?] Unknown', 'Inbox.md', 4, '2026-08-01', '#goal');
	assert.equal(canStartTimerFromTask(todo), true);
	assert.equal(canStartTimerFromTask(progress), true);
	assert.equal(canStartTimerFromTask(done), false);
	assert.equal(canStartTimerFromTask(cancelled), false);
	assert.equal(canStartTimerFromTask(unknown), false);
	assert.equal(getTaskMenuActions(done, true, true).includes('start-timer'), false);
});

test('task timer default title removes Markdown decoration', () => {
	const task = parseTaskLine('- [ ] [阅读计划](Projects/Reading.md) ==***30 分钟***== `专注`', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.equal(taskTimerDefaultName(task), '阅读计划 30 分钟 专注');
});

test('timer confirmation keys change only with actionable timer state', () => {
	assert.equal(timerStateKey({ status: 'idle', preparation: 'ready', dateKey: '2026-08-18', runningEntries: [] }), 'idle');
	assert.notEqual(
		timerStateKey({ status: 'running', preparation: 'ready', dateKey: '2026-08-18', runningEntries: [{ name: 'A', startTime: '2026-08-18T01:00:00.000Z', path: [] }] }),
		timerStateKey({ status: 'running', preparation: 'ready', dateKey: '2026-08-18', runningEntries: [{ name: 'B', startTime: '2026-08-18T01:00:00.000Z', path: [] }] })
	);
});

testAsync('task timer changes status only after timer start succeeds', async () => {
	const task = parseTaskLine('- [ ] Todo', 'Inbox.md', 0, '2026-08-01', '#goal');
	const calls: string[] = [];
	const outcome = await startTaskTimer(task, '自定义标题', {
		startTimer: async () => {
			calls.push('timer');
			return { ok: true };
		},
		canUpdateStatus: true,
		setInProgress: async () => {
			calls.push('status');
			return { ok: true };
		},
	});
	assert.deepEqual(calls, ['timer', 'status']);
	assert.equal(outcome.ok, true);
	if (outcome.ok) assert.equal(outcome.statusUpdate, 'updated');
});

testAsync('task timer does not mutate status when timer start fails or task is readonly', async () => {
	const task = parseTaskLine('- [ ] Todo', 'Inbox.md', 0, '2026-08-01', '#goal');
	let statusWrites = 0;
	const failed = await startTaskTimer(task, 'Todo', {
		startTimer: async () => ({ ok: false, reason: 'io-error', message: 'failed' }),
		canUpdateStatus: true,
		setInProgress: async () => {
			statusWrites++;
			return { ok: true };
		},
	});
	assert.equal(failed.ok, false);
	const readonly = await startTaskTimer(task, 'Todo', {
		startTimer: async () => ({ ok: true }),
		canUpdateStatus: false,
		setInProgress: async () => {
			statusWrites++;
			return { ok: true };
		},
	});
	assert.equal(statusWrites, 0);
	assert.equal(readonly.ok, true);
	if (readonly.ok) assert.equal(readonly.statusUpdate, 'unchanged');
});

testAsync('task timer reports partial success when status update fails', async () => {
	const task = parseTaskLine('- [ ] Todo', 'Inbox.md', 0, '2026-08-01', '#goal');
	const outcome = await startTaskTimer(task, 'Todo', {
		startTimer: async () => ({ ok: true }),
		canUpdateStatus: true,
		setInProgress: async () => ({ ok: false, reason: 'line-mismatch-not-found', message: 'stale task' }),
	});
	assert.equal(outcome.ok, true);
	if (outcome.ok) {
		assert.equal(outcome.statusUpdate, 'update-failed');
		assert.equal(outcome.statusResult?.ok, false);
	}
});

testAsync('task timer converts a thrown status write into partial success', async () => {
	const task = parseTaskLine('- [ ] Todo', 'Inbox.md', 0, '2026-08-01', '#goal');
	const outcome = await startTaskTimer(task, 'Todo', {
		startTimer: async () => ({ ok: true }),
		canUpdateStatus: true,
		setInProgress: async () => { throw new Error('status exploded'); },
	});
	assert.equal(outcome.ok, true);
	if (outcome.ok) {
		assert.equal(outcome.statusUpdate, 'update-failed');
		assert.deepEqual(outcome.statusResult, { ok: false, reason: 'io-error', message: 'Error: status exploded' });
	}
});

test('routine progress hides empty models and counts completed items', () => {
	assert.equal(getRoutineProgress(undefined), null);
	assert.equal(getRoutineProgress({ id: 'daily', title: '每日流程', items: [] }), null);
	assert.deepEqual(getRoutineProgress({
		id: 'daily',
		title: '每日流程',
		items: [
			{ id: 'a', title: 'A', done: true },
			{ id: 'b', title: 'B', done: false },
			{ id: 'c', title: 'C', done: true },
		],
	}), { completed: 2, total: 3 });
});

const routineDocument: RoutineDocument = {
	version: 1,
	groups: [{
		id: 'group-daily',
		title: '每日流程',
		subtitle: '固定例行事项',
		enabled: true,
		order: 0,
		items: [{
			id: 'item-medicine',
			title: '吃药',
			enabled: true,
			order: 0,
			priority: 'high',
			schedule: { weekdays: [1, 2, 3, 4, 5, 6, 7], activeFrom: '2026-08-01', activeUntil: '2026-08-31', reminderTime: '08:30' },
		}, {
			id: 'item-ai',
			title: '今日 AI 资讯',
			enabled: true,
			order: 1,
			schedule: { weekdays: [1, 3, 5] },
		}],
	}],
};

test('routine definition round-trips stable IDs schedules ordering and priorities', () => {
	const serialized = serializeRoutineDocument(routineDocument);
	const parsed = parseRoutineDocument(serialized);
	assert.equal(parsed.diagnostics.length, 0);
	assert.equal(serializeRoutineDocument(parsed.document), serialized);
	assert.deepEqual(parsed.document.groups[0].items[0], routineDocument.groups[0].items[0]);
	assert.deepEqual(parsed.document.groups[0].items[1].schedule.weekdays, [1, 3, 5]);
});

test('routine schedules include both date boundaries and respect weekdays', () => {
	assert.deepEqual(activeRoutineGroups(routineDocument, '2026-08-03')[0].items.map((item) => item.id), ['item-medicine', 'item-ai']);
	assert.deepEqual(activeRoutineGroups(routineDocument, '2026-08-04')[0].items.map((item) => item.id), ['item-medicine']);
	assert.equal(activeRoutineGroups(routineDocument, '2026-08-01')[0].items.some((item) => item.id === 'item-medicine'), true);
	assert.equal(activeRoutineGroups(routineDocument, '2026-08-31')[0].items.some((item) => item.id === 'item-medicine'), true);
	assert.equal(activeRoutineGroups(routineDocument, '2026-09-01').some((group) => group.items.some((item) => item.id === 'item-medicine')), false);
});

test('routine generation inserts at a unique slot once and preserves CRLF', () => {
	const original = '\uFEFF# 日记\r\n<!-- time-grid-routine-slot:start -->\r\n<!-- time-grid-routine-slot:end -->\r\n尾部\r\n';
	const first = insertRoutineInstancesAtSlot(original, routineDocument, '2026-08-03');
	assert.equal(first.changed, true);
	assert.match(first.content, /time-grid-routine-instance group="group-daily" date="2026-08-03" item="item-medicine" reminder="08:30"/);
	assert.equal(first.content.includes('\r\n'), true);
	assert.equal(first.content.startsWith('\uFEFF'), true);
	const second = insertRoutineInstancesAtSlot(first.content, routineDocument, '2026-08-03');
	assert.equal(second.changed, false);
	assert.equal(second.content, first.content);
});

test('legacy routine migration extracts readable groups and replaces only the template block', () => {
	const legacy = '# Daily\n\n> [!CHECK] :LiRotateCw: 每日流程(Routine)\n> - [ ] 吃药\n> - [ ] 今日 AI 资讯\n>\n## 其他\n';
	const document = routineDocumentFromLegacy(legacy);
	assert.equal(document.groups.length, 1);
	assert.deepEqual(document.groups[0].items.map((item) => item.title), ['吃药', '今日 AI 资讯']);
	const replaced = replaceLegacyRoutineWithSlot(legacy);
	assert.equal(replaced.changed, true);
	assert.match(replaced.content, /time-grid-routine-slot:start/);
	assert.match(replaced.content, /## 其他/);
	assert.equal(replaced.content.includes('- [ ] 吃药'), false);
});

test('today legacy adoption adds stable markers while leaving unmatched today-only tasks alone', () => {
	const legacy = '> [!CHECK] 每日流程\n> - [ ] 吃药\n> - [ ] 临时加餐\n';
	const adopted = adoptLegacyRoutineInstances(legacy, routineDocument, '2026-08-03');
	assert.equal(adopted.changed, true);
	assert.match(adopted.content, /吃药 <!-- time-grid-routine-instance group="group-daily" date="2026-08-03" item="item-medicine" reminder="08:30" legacy="true" -->/);
	assert.match(adopted.content, /> - \[ \] 临时加餐\n/);
	const parsed = parseRoutineInstances(adopted.content, '02-Daily Notes/2026-08-03.md', '2026-08-03', routineDocument, '#goal');
	assert.equal(parsed.instances.find((item) => item.itemId === 'item-medicine')?.todayOnly, false);
	assert.equal(parsed.instances.find((item) => item.task.description === '临时加餐')?.todayOnly, true);
});

test('ambiguous legacy titles are never guessed during adoption', () => {
	const duplicate: RoutineDocument = {
		version: 1,
		groups: [{ ...routineDocument.groups[0], items: [routineDocument.groups[0].items[0], { ...routineDocument.groups[0].items[0], id: 'item-duplicate', order: 2 }] }],
	};
	const content = '> [!CHECK] 每日流程\n> - [ ] 吃药\n';
	const adopted = adoptLegacyRoutineInstances(content, duplicate, '2026-08-03');
	assert.equal(adopted.changed, false);
	assert.match(adopted.error ?? '', /无法唯一匹配/);
	assert.equal(adopted.content, content);
});

test('new and historical legacy routine task lines are excluded from the ordinary task index', () => {
	const generated = insertRoutineInstancesAtSlot('<!-- time-grid-routine-slot:start -->\n<!-- time-grid-routine-slot:end -->\n', routineDocument, '2026-08-03').content;
	assert.equal(getRoutineTaskLineNumbers(generated).size, 2);
	const legacy = '> [!CHECK] 每日惯例\n> - [ ] A\n> - [x] B\n';
	assert.deepEqual([...getRoutineTaskLineNumbers(legacy)], [1, 2]);
});

test('routine task edits preserve hidden identity and place terminal dates before it', () => {
	const content = insertRoutineInstancesAtSlot('<!-- time-grid-routine-slot:start -->\n<!-- time-grid-routine-slot:end -->\n', routineDocument, '2026-08-03').content;
	const line = content.split('\n').find((value) => value.includes('item-medicine'))!;
	const task = parseTaskLine(line, 'Daily.md', 3, '2026-08-03', '#goal');
	const done = serializeStatusChange(task, 'done', DEFAULT_TASK_SETTINGS, '2026-08-03');
	assert.match(done, /✅ 2026-08-03 <!-- time-grid-routine-instance/);
	const renamed = serializeTaskPatch(parseTaskLine(done, 'Daily.md', 3, '2026-08-03', '#goal'), {
		description: '今天吃药',
		routineReminderTime: '09:15',
		routineGroupId: 'group-health',
	}, DEFAULT_TASK_SETTINGS);
	assert.match(renamed, /今天吃药/);
	assert.match(renamed, /item="item-medicine"/);
	assert.match(renamed, /reminder="09:15"/);
	assert.match(renamed, /group="group-health"/);
});

test('routine reminders show due state without treating skipped items as due', () => {
	const parsed = parseRoutineInstances(
		insertRoutineInstancesAtSlot('<!-- time-grid-routine-slot:start -->\n<!-- time-grid-routine-slot:end -->\n', routineDocument, '2026-08-03').content,
		'Daily.md', '2026-08-03', routineDocument, '#goal'
	);
	const instance = parsed.instances.find((item) => item.itemId === 'item-medicine')!;
	assert.equal(isRoutineReminderDue(instance, new Date(2026, 7, 3, 9, 0), '2026-08-03'), true);
	assert.equal(reminderKey(instance), '2026-08-03:item-medicine');
	instance.task.status = 'cancelled';
	assert.equal(isRoutineReminderDue(instance, new Date(2026, 7, 3, 9, 0), '2026-08-03'), false);
});

test('duplicate and wrong-date routine instances remain visible but readonly', () => {
	const generated = insertRoutineInstancesAtSlot('<!-- time-grid-routine-slot:start -->\n<!-- time-grid-routine-slot:end -->\n', routineDocument, '2026-08-03').content;
	const medicine = generated.split('\n').find((line) => line.includes('item-medicine'))!;
	const duplicated = generated.replace('<!-- time-grid-routine-instances:end -->', `${medicine.replace('吃药', '重复吃药')}\n<!-- time-grid-routine-instances:end -->`);
	const duplicateParsed = parseRoutineInstances(duplicated, 'Daily.md', '2026-08-03', routineDocument, '#goal');
	const duplicateItems = duplicateParsed.instances.filter((item) => item.itemId === 'item-medicine');
	assert.equal(duplicateItems.length, 2);
	assert.equal(duplicateItems.every((item) => getTaskWriteBlockReason(item.task)?.includes('实例 ID 重复')), true);
	const wrongDate = generated.replace(/date="2026-08-03" item="item-medicine"/, 'date="2026-08-02" item="item-medicine"');
	const wrongParsed = parseRoutineInstances(wrongDate, 'Daily.md', '2026-08-03', routineDocument, '#goal');
	assert.match(getTaskWriteBlockReason(wrongParsed.instances.find((item) => item.itemId === 'item-medicine')!.task) ?? '', /日期/);
});

test('routine calendar uses the natural previous day across month and year boundaries', () => {
	assert.equal(previousDateKey('2026-08-01'), '2026-07-31');
	assert.equal(previousDateKey('2026-01-01'), '2025-12-31');
});

test('task status control keeps a separate compact visual label', () => {
	const source = readFileSync(resolve('src/components/TaskPanel.ts'), 'utf8');
	assert.match(source, /cls: `tg-task-status-control is-\$\{displayStatus\}`/);
	assert.match(source, /statusButton\.createSpan\(\{ cls: `tg-task-status-badge is-\$\{displayStatus\}`/);
	assert.match(source, /statusButton\.addEventListener\('click', \(event\) => this\.openStatusMenu/);
});

test('task card style contract matches the compact Claude design', () => {
	const css = readFileSync(resolve('src/styles/main.css'), 'utf8');
	const card = css.match(/\.tg-task-row \{([\s\S]*?)\n\}/)?.[1] ?? '';
	const badge = css.match(/\.tg-task-status-badge \{([\s\S]*?)\n\}/)?.[1] ?? '';
	assert.match(card, /padding:\s*10px 12px/);
	assert.match(card, /border-radius:\s*var\(--tg-task-radius\)/);
	assert.match(badge, /min-height:\s*18px/);
	assert.match(badge, /padding:\s*2px 8px/);
	assert.match(badge, /border:\s*1px solid/);
	assert.match(badge, /background:\s*transparent !important/);
	assert.match(badge, /box-shadow:\s*none !important/);
	assert.match(badge, /font-size:\s*10px/);
	assert.doesNotMatch(badge, /(?:^|\n)\s*(?:width|min-width|max-width):\s*[1-9]\d*px/);
	assert.doesNotMatch(css, /\.tg-task-status-badge\.is-(?:in-progress|done|cancelled|unknown)\s*\{[^}]*background:/);
	assert.match(css, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.tg-task-status-control \{[\s\S]*?min-width:\s*36px(?:\s*!important)?;[\s\S]*?min-height:\s*36px(?:\s*!important)?;/);
});

test('timer block insertion prefers the unique template slot and preserves CRLF BOM', () => {
	const source = `\uFEFF# Daily\r\n${TIMER_SLOT_START}\r\n${TIMER_SLOT_END}\r\n尾部\r\n`;
	const inserted = ensureTrackerBlock(source);
	assert.equal(inserted.result.ok, true);
	assert.equal(inserted.content.startsWith('\uFEFF'), true);
	assert.equal(inserted.content.includes('\r\n'), true);
	assert.match(inserted.content, /time-grid-timer-slot:start -->\r\n```simple-time-tracker/);
	assert.match(inserted.content, /```\r\n<!-- time-grid-timer-slot:end/);
	assert.equal(inserted.content.endsWith('尾部\r\n'), true);
});

test('timer block insertion appends a restrained section when the template has no slot', () => {
	const inserted = ensureTrackerBlock('# Daily\n\n正文\n');
	assert.equal(inserted.result.ok, true);
	assert.match(inserted.content, /正文\n\n## 时间记录\n\n```simple-time-tracker/);
});

test('timer parser accepts zero or one block and rejects multiple blocks invalid JSON and malformed markers', () => {
	assert.equal(inspectTimerContent('# Daily\n').status, 'missing');
	assert.equal(inspectTimerContent('```simple-time-tracker\n\n```\n').status, 'ready');
	assert.equal(inspectTimerContent('```simple-time-tracker\n{bad}\n```\n').status, 'invalid');
	const block = '```simple-time-tracker\n{"entries":[]}\n```\n';
	assert.equal(inspectTimerContent(`${block}\n${block}`).status, 'multiple');
	assert.equal(inspectTimerContent(`${TIMER_SLOT_START}\n${block}`).status, 'invalid');
});

test('duration parser treats the official empty tracker block as an empty valid document', () => {
	assert.deepEqual(parseSimpleTimeTracker('```simple-time-tracker\n```\n'), { status: 'ok', data: { entries: [] } });
});

test('timer suggestions use readable task display names without Markdown decoration', () => {
	assert.equal(timerSuggestionName('Leetcode ==***5 道***=='), 'Leetcode 5 道');
	assert.equal(timerSuggestionName('[阅读计划](Projects/Reading.md)  `30min`'), '阅读计划 30min');
});

test('timer start trims names and preserves unknown JSON fields and nested records', () => {
	const source = '前文\n```simple-time-tracker\n{"version":7,"custom":{"keep":true},"entries":[{"name":"分组","opaque":"yes","subEntries":[{"name":"旧记录","startTime":"2026-08-02T00:00:00.000Z","endTime":"2026-08-02T01:00:00.000Z","extra":9}]}]}\n```\n后文\n';
	const started = startTimerInContent(source, '  写代码  ', new Date('2026-08-02T02:00:00.000Z'));
	assert.equal(started.result.ok, true);
	assert.match(started.content, /"version":7/);
	assert.match(started.content, /"custom":\{"keep":true\}/);
	assert.match(started.content, /"opaque":"yes"/);
	assert.match(started.content, /"extra":9/);
	assert.equal(started.content.startsWith('前文\n'), true);
	assert.equal(started.content.endsWith('后文\n'), true);
	assert.deepEqual(inspectTimerContent(started.content).runningEntries.map((entry) => entry.name), ['写代码']);
});

test('timer rejects empty activity names without changing content', () => {
	const source = '```simple-time-tracker\n{"entries":[]}\n```\n';
	const result = startTimerInContent(source, '   ', new Date('2026-08-02T02:00:00.000Z'));
	assert.equal(result.result.ok, false);
	assert.equal(result.changed, false);
	assert.equal(result.content, source);
});

test('timer switch closes the old activity and opens the new one at the same timestamp', () => {
	const started = startTimerInContent('', '阅读', new Date('2026-08-02T02:00:00.000Z'));
	const switched = startTimerInContent(started.content, '写代码', new Date('2026-08-02T03:04:05.000Z'));
	assert.deepEqual(switched.result, { ok: true, switchedFrom: '阅读' });
	const document = inspectTimerContent(switched.content).document!;
	assert.equal(document.entries.length, 2);
	assert.equal(document.entries[0].endTime, '2026-08-02T03:04:05.000Z');
	assert.equal(document.entries[1].startTime, '2026-08-02T03:04:05.000Z');
	assert.equal(document.entries[1].endTime, null);
});

test('timer start and stop create independent segments for the same activity', () => {
	const first = startTimerInContent('', '阅读', new Date('2026-08-02T02:00:00.000Z'));
	const stopped = stopTimerInContent(first.content, new Date('2026-08-02T02:30:00.000Z'));
	const second = startTimerInContent(stopped.content, '阅读', new Date('2026-08-02T03:00:00.000Z'));
	const entries = inspectTimerContent(second.content).document!.entries;
	assert.equal(entries.length, 2);
	assert.equal(entries[0].endTime, '2026-08-02T02:30:00.000Z');
	assert.equal(entries[1].endTime, null);
});

test('nested multiple running timers require explicit conflict resolution', () => {
	const source = '```simple-time-tracker\n{"entries":[{"name":"组","subEntries":[{"name":"A","startTime":"2026-08-02T01:00:00.000Z","endTime":null},{"name":"B","startTime":"2026-08-02T01:30:00.000Z","endTime":null}]}]}\n```\n';
	const rejected = startTimerInContent(source, 'C', new Date('2026-08-02T02:00:00.000Z'));
	assert.equal(rejected.result.ok, false);
	assert.equal(rejected.content, source);
	const resolved = startTimerInContent(source, 'C', new Date('2026-08-02T02:00:00.000Z'), true);
	assert.equal(resolved.result.ok, true);
	assert.deepEqual(inspectTimerContent(resolved.content).runningEntries.map((entry) => entry.name), ['C']);
});

test('cross-midnight close and continuation upsert are idempotent and refuse stale edits', () => {
	const startTime = '2026-08-01T14:00:00.000Z';
	const started = startTimerInContent('', '写代码', new Date(startTime));
	const closed = closeTimerByIdentity(started.content, '写代码', startTime, new Date('2026-08-01T16:00:00.000Z'));
	assert.equal(closed.result.ok, true);
	const closedAgain = closeTimerByIdentity(closed.content, '写代码', startTime, new Date('2026-08-01T16:00:00.000Z'));
	assert.equal(closedAgain.result.ok, true);
	assert.equal(closedAgain.changed, false);
	const continued = upsertTimerSegment('', '写代码', new Date('2026-08-01T16:00:00.000Z'), null);
	const continuedAgain = upsertTimerSegment(continued.content, '写代码', new Date('2026-08-01T16:00:00.000Z'), null);
	assert.equal(continuedAgain.result.ok, true);
	assert.equal(continuedAgain.changed, false);
	const stale = closeTimerByIdentity(closed.content, '写代码', startTime, new Date('2026-08-01T17:00:00.000Z'));
	assert.equal(stale.result.ok, false);
	assert.equal(stale.content, closed.content);
});

test('sundial production CSS preserves the approved Claude Design breakpoints and reduced motion', () => {
	const css = readFileSync(resolve('src/styles/main.css'), 'utf8');
	assert.match(css, /@container tg-sundial \(max-width: 299px\)/);
	assert.match(css, /@container tg-sundial \(min-width: 420px\)/);
	assert.match(css, /@container tg-sundial \(min-width: 680px\)/);
	assert.match(css, /prefers-reduced-motion: reduce/);
	assert.match(css, /\.tg-sundial-dial-now/);
	assert.match(css, /\.tg-timer-panel/);
	assert.match(css, /\.tg-timer-panel\.running/);
	assert.match(css, /\.tg-timer-panel\.error/);
	assert.match(css, /\.tg-btn-primary/);
	assert.match(css, /\.tg-btn-neutral/);
	assert.match(css, /\.tg-btn-danger-quiet/);
	assert.match(css, /\.tg-btn-quiet/);
	assert.match(css, /\.tg-chip/);
	assert.match(css, /\.tg-timer-live-dot/);
	assert.match(css, /@container tgtimer/);
	const sundialSource = readFileSync(resolve('src/components/SundialTimeView.ts'), 'utf8');
	assert.match(sundialSource, /document\.createElement\('span'\)/);
	assert.doesNotMatch(sundialSource, /document\.createSpan/);
	assert.match(css, /\.tg-sundial-heat-cell \{[\s\S]*?border-radius: var\(--tg-cell-radius\)/);
	assert.match(css, /\.tg-sundial-heat-cell\.is-today::after/);
	assert.match(css, /--tg-heatmap-cell-size: 10px/);
});

test('linked task resolves only on an unambiguous single match', () => {
	const todo = parseTaskLine('- [ ] 写周报', 'Inbox.md', 0, '2026-09-03', '#goal');
	const other = parseTaskLine('- [ ] 别的事', 'Inbox.md', 1, '2026-09-03', '#goal');
	const duplicate = parseTaskLine('- [ ] 写周报', 'Inbox.md', 7, '2026-09-03', '#goal');
	const elsewhere = parseTaskLine('- [ ] 写周报', 'Other.md', 0, '2026-09-03', '#goal');
	const link = { filePath: 'Inbox.md', raw: '- [ ] 写周报', stateKey: 'running' };

	assert.equal(resolveLinkedTask(link, [todo, other]), todo);
	// 同一文件里出现两行完全相同的任务：宁可丢失关联也不猜
	assert.equal(resolveLinkedTask(link, [todo, duplicate]), null);
	// 任务被删除或原文被改写
	assert.equal(resolveLinkedTask(link, [other]), null);
	// 同名但在别的文件里，不算命中
	assert.equal(resolveLinkedTask(link, [elsewhere]), null);
});

test('only writable non-terminal tasks can be completed from the stop dialog', () => {
	const todo = parseTaskLine('- [ ] 写周报', 'Inbox.md', 0, '2026-09-03', '#goal');
	const doing = parseTaskLine('- [/] 写周报', 'Inbox.md', 0, '2026-09-03', '#goal');
	const done = parseTaskLine('- [x] 写周报 ✅ 2026-09-03', 'Inbox.md', 0, '2026-09-03', '#goal');
	const cancelled = parseTaskLine('- [-] 写周报 ❌ 2026-09-03', 'Inbox.md', 0, '2026-09-03', '#goal');
	const recurring = parseTaskLine('- [ ] 写周报 🔁 every week', 'Inbox.md', 0, '2026-09-03', '#goal');

	assert.equal(canCompleteLinkedTask(todo), true);
	assert.equal(canCompleteLinkedTask(doing), true);
	assert.equal(canCompleteLinkedTask(done), false);
	assert.equal(canCompleteLinkedTask(cancelled), false);
	assert.equal(canCompleteLinkedTask(recurring), false);
});

test('timer state key changes whenever the running identity changes', () => {
	const base = { preparation: 'ready' as const, dateKey: '2026-09-03', runningEntries: [] };
	const running = (name: string, startTime: string) => timerStateKey({
		...base,
		status: 'running',
		runningEntries: [{ name, startTime, path: [0] }],
	});
	const first = running('写周报', '2026-09-03T04:00:00.000Z');

	assert.equal(running('写周报', '2026-09-03T04:00:00.000Z'), first);
	assert.notEqual(running('别的事', '2026-09-03T04:00:00.000Z'), first);
	assert.notEqual(running('写周报', '2026-09-03T05:00:00.000Z'), first);
	assert.notEqual(timerStateKey({ ...base, status: 'idle' }), first);
});

testAsync('stopping a timer never touches the task when the timer write fails', async () => {
	let statusWrites = 0;
	const outcome = await stopTaskTimer({
		stopTimer: async () => ({ ok: false, reason: 'conflict', message: '有多个运行中的活动' }),
		complete: async () => {
			statusWrites++;
			return { ok: true };
		},
	});
	assert.equal(outcome.ok, false);
	assert.equal(statusWrites, 0);
});

testAsync('stop-only leaves the task status untouched', async () => {
	const outcome = await stopTaskTimer({ stopTimer: async () => ({ ok: true }) });
	assert.equal(outcome.ok, true);
	if (outcome.ok) assert.equal(outcome.statusUpdate, 'unchanged');
});

testAsync('stop-and-complete writes the task only after the timer stopped', async () => {
	const calls: string[] = [];
	const outcome = await stopTaskTimer({
		stopTimer: async () => {
			calls.push('timer');
			return { ok: true };
		},
		complete: async () => {
			calls.push('status');
			return { ok: true };
		},
	});
	assert.deepEqual(calls, ['timer', 'status']);
	assert.equal(outcome.ok, true);
	if (outcome.ok) assert.equal(outcome.statusUpdate, 'updated');
});

testAsync('a failed completion after a successful stop reports partial success', async () => {
	const rejected = await stopTaskTimer({
		stopTimer: async () => ({ ok: true }),
		complete: async () => ({ ok: false, reason: 'line-mismatch-ambiguous', message: '发现重复任务' }),
	});
	assert.equal(rejected.ok, true);
	if (rejected.ok) {
		assert.equal(rejected.statusUpdate, 'update-failed');
		assert.equal(rejected.statusResult?.ok, false);
	}

	const thrown = await stopTaskTimer({
		stopTimer: async () => ({ ok: true }),
		complete: async () => {
			throw new Error('磁盘错误');
		},
	});
	assert.equal(thrown.ok, true);
	if (thrown.ok) assert.equal(thrown.statusUpdate, 'update-failed');
});

testAsync('switching can complete the previous task without blocking the new timer', async () => {
	const task = parseTaskLine('- [ ] 新任务', 'Inbox.md', 0, '2026-09-03', '#goal');
	const calls: string[] = [];
	const outcome = await startTaskTimer(task, '新任务', {
		startTimer: async () => {
			calls.push('timer');
			return { ok: true, switchedFrom: '旧任务' };
		},
		canUpdateStatus: true,
		setInProgress: async () => {
			calls.push('status');
			return { ok: true };
		},
		completePrevious: async () => {
			calls.push('previous');
			return { ok: false, reason: 'read-only-task', message: '循环任务' };
		},
	});
	// 计时先写，旧任务的失败不影响新任务转进行中
	assert.deepEqual(calls, ['timer', 'previous', 'status']);
	assert.equal(outcome.ok, true);
	if (outcome.ok) {
		assert.equal(outcome.previousUpdate, 'update-failed');
		assert.equal(outcome.statusUpdate, 'updated');
	}
});

test('stop dialog and switch checkbox contracts', () => {
	const stopModal = readFileSync(resolve('src/components/TimerStopModal.ts'), 'utf8');
	const timerModal = readFileSync(resolve('src/components/TaskTimerModal.ts'), 'utf8');
	const view = readFileSync(resolve('src/views/TimeGridView.ts'), 'utf8');
	const sundial = readFileSync(resolve('src/components/SundialTimeView.ts'), 'utf8');
	const css = readFileSync(resolve('src/styles/main.css'), 'utf8');
	// 三个选项，且提交前重读快照
	assert.match(stopModal, /停止并完成/);
	assert.match(stopModal, /仅停止/);
	assert.match(stopModal, /继续计时/);
	assert.match(stopModal, /计时状态刚刚发生变化，请重新确认/);
	// 两个停止入口统一走 requestStop
	assert.match(sundial, /this\.options\.requestStop\(\)/);
	assert.match(view, /requestStopTimer\(\)/);
	// 无关联时保持原有的一点即停
	assert.match(view, /canCompleteLinkedTask\(linked\)/);
	assert.match(timerModal, /getCompletablePreviousName/);
	assert.match(css, /\.tg-task-timer-complete-previous/);
});

test('new task lines follow the Tasks emoji format', () => {
	assert.equal(
		serializeNewTaskLine({ description: '写周报', created: '2026-09-03', due: '2026-09-03' }),
		'- [ ] 写周报 ➕ 2026-09-03 📅 2026-09-03'
	);
	// 清除到期日后不写 📅
	assert.equal(
		serializeNewTaskLine({ description: '写周报', created: '2026-09-03' }),
		'- [ ] 写周报 ➕ 2026-09-03'
	);
	// 🆔 只在需要时出现，且排在最后
	assert.equal(
		serializeNewTaskLine({ description: '写周报', created: '2026-09-03', due: '2026-09-03', id: 'ab12cd' }),
		'- [ ] 写周报 ➕ 2026-09-03 📅 2026-09-03 🆔 ab12cd'
	);
	// 描述里的换行与多余空白会被压平，避免破坏单行任务格式
	assert.equal(
		serializeNewTaskLine({ description: '  写\n  周报  ', created: '2026-09-03' }),
		'- [ ] 写 周报 ➕ 2026-09-03'
	);
});

test('inbox slot is created once and never guessed when ambiguous', () => {
	const scaffold = createInboxScaffold('Time Grid Tasks');
	assert.match(scaffold, /<!-- time-grid-task-slot:start -->/);
	assert.deepEqual(findTaskSlot(scaffold), {
		start: scaffold.indexOf(TASK_SLOT_START),
		end: scaffold.indexOf(TASK_SLOT_END),
	});

	// 空文件与无插槽文件都会补上一对插槽
	assert.equal(ensureTaskSlot('').changed, true);
	const appended = ensureTaskSlot('# 收件箱');
	assert.equal(appended.changed, true);
	assert.match(appended.content, /# 收件箱\n<!-- time-grid-task-slot:start -->/);
	// 已有插槽时不重复添加
	assert.equal(ensureTaskSlot(scaffold).changed, false);

	// 0 个 / 多个 / 顺序颠倒一律报错拒写
	assert.ok('error' in findTaskSlot('# 没有插槽'));
	assert.ok('error' in findTaskSlot(`${scaffold}${scaffold}`));
	assert.ok('error' in findTaskSlot(`${TASK_SLOT_END}\n${TASK_SLOT_START}`));
});

test('task lines are inserted before the slot end and keep CRLF', () => {
	const lf = createInboxScaffold('Inbox');
	const inserted = insertTaskLine(lf, '- [ ] 写周报 ➕ 2026-09-03');
	assert.equal(inserted.changed, true);
	assert.ok(inserted.content.indexOf('- [ ] 写周报') < inserted.content.indexOf(TASK_SLOT_END));

	const crlf = createInboxScaffold('Inbox', '\r\n');
	const crlfInserted = insertTaskLine(crlf, '- [ ] 写周报');
	assert.ok(crlfInserted.content.includes('- [ ] 写周报\r\n'));
	assert.ok(!/[^\r]\n/.test(crlfInserted.content));

	// 追加第二条时排在第一条之后
	const second = insertTaskLine(inserted.content, '- [ ] 另一件事');
	assert.ok(second.content.indexOf('- [ ] 写周报') < second.content.indexOf('- [ ] 另一件事'));
});

test('duplicate detection and id generation keep later writes unambiguous', () => {
	const content = createInboxScaffold('Inbox') + '- [ ] 写周报 ➕ 2026-09-03 🆔 aaaaaa\n';
	assert.equal(collidesWithExistingLine(content, '- [ ] 写周报 ➕ 2026-09-03 🆔 aaaaaa'), true);
	assert.equal(collidesWithExistingLine(content, '- [ ] 别的事'), false);
	assert.equal(collidesWithExistingLine(content, '   '), false);

	// 生成的 ID 不会撞上文件里已有的
	let calls = 0;
	const sequence = ['aaaaaa', 'bbbbbb'];
	const id = generateTaskId(content, () => {
		const word = sequence[Math.min(Math.floor(calls / 6), sequence.length - 1)];
		const char = word[calls % 6];
		calls++;
		return 'abcdefghijklmnopqrstuvwxyz0123456789'.indexOf(char) / 36;
	});
	assert.equal(id, 'bbbbbb');
});

test('an id is added only when the new task collides with an existing line', () => {
	const base = createInboxScaffold('Inbox');
	const draft = { description: '写周报', created: '2026-09-03', due: '2026-09-03' };

	const first = appendTaskToInbox(base, draft);
	assert.equal(first.changed, true);
	assert.equal(first.line, '- [ ] 写周报 ➕ 2026-09-03 📅 2026-09-03');
	// 干净的笔记里不挂 ID
	assert.ok(!first.content.includes('🆔'));

	// 完全相同的第二条才补 ID，保证「原文全局唯一」仍成立
	const second = appendTaskToInbox(first.content, draft);
	assert.equal(second.changed, true);
	assert.match(String(second.line), /🆔 [a-z0-9]{6}$/);
	const lines = second.content.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- [ ]'));
	assert.equal(new Set(lines).size, lines.length);
});

test('a broken inbox slot refuses the write instead of picking one', () => {
	const duplicated = createInboxScaffold('Inbox') + createInboxScaffold('Inbox');
	const result = appendTaskToInbox(duplicated, { description: '写周报', created: '2026-09-03' });
	assert.equal(result.changed, false);
	assert.equal(result.content, duplicated);
	assert.match(String(result.error), /多个 Time Grid 任务插槽/);
});

test('inbox path falls back to the default when blank', () => {
	assert.equal(normalizeTimeGridData({}).taskSettings.inboxPath, 'Time Grid Tasks.md');
	assert.equal(
		normalizeTimeGridData({ taskSettings: { inboxPath: '   ' } }).taskSettings.inboxPath,
		'Time Grid Tasks.md'
	);
	assert.equal(
		normalizeTimeGridData({ taskSettings: { inboxPath: ' Notes/Inbox.md ' } }).taskSettings.inboxPath,
		'Notes/Inbox.md'
	);
});

test('task creation UI contracts', () => {
	const panel = readFileSync(resolve('src/components/TaskPanel.ts'), 'utf8');
	const modal = readFileSync(resolve('src/components/TaskCreateModal.ts'), 'utf8');
	const writer = readFileSync(resolve('src/utils/taskWriter.ts'), 'utf8');
	assert.match(panel, /'新建任务'/);
	assert.match(panel, /setIcon\(create, 'plus'\)/);
	// 默认到期日是今天，且可清除
	assert.match(modal, /due = getTodayKey\(\)/);
	assert.match(modal, /'清除'/);
	// 新建同样走 Vault.process 并扣除写作统计
	assert.match(writer, /vault\.process/);
	assert.match(writer, /addTaskWriteSuppression/);
});

test('task timer UI has modal confirmation, live strip, cleanup and narrow layout contracts', () => {
	const panel = readFileSync(resolve('src/components/TaskPanel.ts'), 'utf8');
	const modal = readFileSync(resolve('src/components/TaskTimerModal.ts'), 'utf8');
	const css = readFileSync(resolve('src/styles/main.css'), 'utf8');
	assert.match(panel, /unsubscribeTimer/);
	assert.match(panel, /stopTimerTicker\(\)/);
	assert.match(panel, /tg-task-timer-strip-elapsed/);
	assert.match(panel, /this\.options\.timer\.requestStop\(\)/);
	assert.match(modal, /计时状态刚刚发生变化，请重新确认/);
	assert.match(modal, /已经正在计时，无需重复开始/);
	assert.match(css, /\.tg-task-timer-strip/);
	assert.match(css, /\.modal\.tg-task-timer-modal/);
	assert.match(css, /@container tg-task-view \(max-width: 260px\)/);
});

void (async () => {
	for (const item of asyncTests) {
		try {
			await item.fn();
			passed++;
			console.log(`✓ ${item.name}`);
		} catch (error) {
			console.error(`✗ ${item.name}`);
			throw error;
		}
	}
	console.log(`\n${passed} task core tests passed.`);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
