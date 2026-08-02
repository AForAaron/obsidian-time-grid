import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	closeTimerByIdentity,
	inspectTimerContent,
	startTimerInContent,
	stopTimerInContent,
	TIMER_SLOT_END,
	TIMER_SLOT_START,
	TimerContentMutation,
	upsertTimerSegment,
} from '../src/utils/timerFormat';

async function main(): Promise<void> {
	const vault = await mkdtemp(join(tmpdir(), 'time-grid-timer-vault-'));
	let writes = 0;
	try {
		const daily = join(vault, '02-Daily Notes');
		await mkdir(daily, { recursive: true });
		const firstPath = join(daily, '2026-08-01.md');
		const secondPath = join(daily, '2026-08-02.md');
		const thirdPath = join(daily, '2026-08-03.md');
		const template = `# Daily\r\n\r\n- [ ] 今日任务\r\n${TIMER_SLOT_START}\r\n${TIMER_SLOT_END}\r\n`;
		await writeFile(firstPath, template);
		execFileSync('git', ['init', '-q'], { cwd: vault });
		execFileSync('git', ['config', 'core.whitespace', 'cr-at-eol'], { cwd: vault });
		execFileSync('git', ['add', '.'], { cwd: vault });
		execFileSync('git', ['-c', 'user.name=Time Grid Test', '-c', 'user.email=time-grid@example.invalid', 'commit', '-qm', 'baseline'], { cwd: vault });

		const startAt = new Date('2026-08-01T14:00:00.000Z');
		await processFile(firstPath, (content) => startTimerInContent(content, '阅读', startAt)); writes++;
		const switchAt = new Date('2026-08-01T15:00:00.000Z');
		await processFile(firstPath, (content) => startTimerInContent(content, '写代码', switchAt)); writes++;
		const afterSwitch = inspectTimerContent(await readFile(firstPath, 'utf8')).document!;
		assert.equal(afterSwitch.entries[0].endTime, switchAt.toISOString());
		assert.equal(afterSwitch.entries[1].startTime, switchAt.toISOString());
		assert.match(await readFile(firstPath, 'utf8'), /- \[ \] 今日任务/);

		const sourceStart = switchAt.toISOString();
		const firstMidnight = new Date('2026-08-01T16:00:00.000Z');
		await processFile(firstPath, (content) => closeTimerByIdentity(content, '写代码', sourceStart, firstMidnight)); writes++;
		await writeFile(secondPath, '# Daily\n');
		await processFile(secondPath, (content) => upsertTimerSegment(content, '写代码', firstMidnight, new Date('2026-08-02T16:00:00.000Z'))); writes++;
		await writeFile(thirdPath, '# Daily\n');
		await processFile(thirdPath, (content) => upsertTimerSegment(content, '写代码', new Date('2026-08-02T16:00:00.000Z'), null)); writes++;
		assert.deepEqual(inspectTimerContent(await readFile(thirdPath, 'utf8')).runningEntries.map((entry) => entry.name), ['写代码']);

		await processFile(thirdPath, (content) => stopTimerInContent(content, new Date('2026-08-02T17:15:00.000Z'))); writes++;
		await processFile(thirdPath, (content) => startTimerInContent(content, '写代码', new Date('2026-08-02T18:00:00.000Z'))); writes++;
		assert.equal(inspectTimerContent(await readFile(thirdPath, 'utf8')).document!.entries.length, 2);

		const beforeExternalChange = await readFile(thirdPath, 'utf8');
		await writeFile(thirdPath, `${beforeExternalChange}\n外部新增内容\n`);
		await processFile(thirdPath, (content) => stopTimerInContent(content, new Date('2026-08-02T19:00:00.000Z'))); writes++;
		assert.match(await readFile(thirdPath, 'utf8'), /外部新增内容/);

		const malformedPath = join(daily, '2026-08-04.md');
		const malformed = '# Daily\n```simple-time-tracker\n{broken}\n```\n不可覆盖\n';
		await writeFile(malformedPath, malformed);
		const rejected = await processFile(malformedPath, (content) => startTimerInContent(content, '危险写入', new Date()));
		assert.equal(rejected.result.ok, false);
		assert.equal(await readFile(malformedPath, 'utf8'), malformed);

		const conflictPath = join(daily, '2026-08-05.md');
		const conflict = '```simple-time-tracker\n{"entries":[{"name":"A","startTime":"2026-08-05T01:00:00.000Z","endTime":null},{"name":"B","startTime":"2026-08-05T02:00:00.000Z","endTime":null}]}\n```\n';
		await writeFile(conflictPath, conflict);
		const conflictRejected = await processFile(conflictPath, (content) => startTimerInContent(content, 'C', new Date('2026-08-05T03:00:00.000Z')));
		assert.equal(conflictRejected.result.ok, false);
		assert.equal(await readFile(conflictPath, 'utf8'), conflict);
		await processFile(conflictPath, (content) => startTimerInContent(content, 'C', new Date('2026-08-05T03:00:00.000Z'), true)); writes++;

		execFileSync('git', ['diff', '--check'], { cwd: vault, stdio: 'inherit' });
		console.log(`✓ temporary Git vault completed ${writes} timer writes, split midnight, preserved concurrent text, and rejected unsafe content`);
	} finally {
		await rm(vault, { recursive: true, force: true });
	}
}

async function processFile(path: string, mutate: (content: string) => TimerContentMutation): Promise<TimerContentMutation> {
	const current = await readFile(path, 'utf8');
	const mutation = mutate(current);
	if (mutation.result.ok && mutation.changed) await writeFile(path, mutation.content);
	return mutation;
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
