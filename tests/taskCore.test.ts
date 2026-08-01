import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	classifyTask,
	getTaskStatusKind,
	isPathExcluded,
	parseTaskLine,
	sortTasks,
} from '../src/utils/taskParser';
import { DEFAULT_TASK_SETTINGS } from '../src/types/task';
import { applyTaskEditToContent, getTaskWriteBlockReason, serializeStatusChange, serializeTaskPatch, shiftDateKey } from '../src/utils/taskWriter';
import { getEffectiveWritingDelta, normalizeTimeGridData } from '../src/utils/writingStats';
import { countFilteredSections, createEmptyTaskFilters, filterTasks, groupFutureTasks, hasActiveTaskFilters } from '../src/utils/taskView';
import { getRoutineProgress, getTaskMenuActions, positionFloatingLayer } from '../src/utils/taskUi';
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

let passed = 0;

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
});

test('task menus vary scheduling actions by task shape', () => {
	const dated = parseTaskLine('- [ ] Dated 📅 2026-08-01', 'Daily.md', 0, '2026-08-01', '#goal');
	const inbox = parseTaskLine('- [ ] Inbox', 'Inbox.md', 0, '2026-08-01', '#goal');
	assert.deepEqual(getTaskMenuActions(dated, true), ['edit', 'postpone-day', 'postpone-week', 'open-source', 'delete']);
	assert.deepEqual(getTaskMenuActions(inbox, true), ['edit', 'set-today', 'set-long-term', 'open-source', 'delete']);
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

console.log(`\n${passed} task core tests passed.`);
