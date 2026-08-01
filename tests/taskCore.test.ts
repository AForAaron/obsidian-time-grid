import * as assert from 'node:assert/strict';
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

console.log(`\n${passed} task core tests passed.`);
