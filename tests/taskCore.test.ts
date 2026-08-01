import * as assert from 'node:assert/strict';
import {
	classifyTask,
	getTaskStatusKind,
	isPathExcluded,
	parseTaskLine,
	sortTasks,
} from '../src/utils/taskParser';

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

console.log(`\n${passed} task core tests passed.`);
