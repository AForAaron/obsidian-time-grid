import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	appendTaskToInbox,
	createInboxScaffold,
	InboxMutation,
	TASK_SLOT_END,
	TASK_SLOT_START,
} from '../src/utils/taskInbox';
import { applyTaskEditToContent, serializeStatusChange } from '../src/utils/taskWriter';
import { parseTaskLine } from '../src/utils/taskParser';
import { DEFAULT_TASK_SETTINGS } from '../src/types/task';

async function main(): Promise<void> {
	const vault = await mkdtemp(join(tmpdir(), 'time-grid-inbox-vault-'));
	let writes = 0;
	try {
		const inboxPath = join(vault, 'Time Grid Tasks.md');
		await writeFile(inboxPath, createInboxScaffold('Time Grid Tasks'));
		execFileSync('git', ['init', '-q'], { cwd: vault });
		execFileSync('git', ['add', '.'], { cwd: vault });
		execFileSync('git', [
			'-c', 'user.name=Time Grid Test',
			'-c', 'user.email=time-grid@example.invalid',
			'commit', '-qm', 'baseline',
		], { cwd: vault });

		const created = '2026-09-03';
		await processFile(inboxPath, (content) => appendTaskToInbox(content, { description: '写周报', created, due: created })); writes++;
		await processFile(inboxPath, (content) => appendTaskToInbox(content, { description: '买菜', created, due: created })); writes++;
		await processFile(inboxPath, (content) => appendTaskToInbox(content, { description: '没有到期日的事', created })); writes++;

		let content = await readFile(inboxPath, 'utf8');
		assert.match(content, /- \[ \] 写周报 ➕ 2026-09-03 📅 2026-09-03/);
		assert.match(content, /- \[ \] 没有到期日的事 ➕ 2026-09-03$/m);
		// 干净的收件箱里不该出现任何 ID
		assert.ok(!content.includes('🆔'));
		// 任务始终落在插槽内部，按创建顺序排列
		assert.ok(content.indexOf(TASK_SLOT_START) < content.indexOf('- [ ] 写周报'));
		assert.ok(content.indexOf('- [ ] 写周报') < content.indexOf('- [ ] 买菜'));
		assert.ok(content.indexOf('- [ ] 买菜') < content.indexOf(TASK_SLOT_END));

		// 重复创建同名同日任务：补 🆔 让两行仍然彼此可区分
		await processFile(inboxPath, (content) => appendTaskToInbox(content, { description: '写周报', created, due: created })); writes++;
		content = await readFile(inboxPath, 'utf8');
		const taskLines = content.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- [ ]'));
		assert.equal(taskLines.length, 4);
		assert.equal(new Set(taskLines).size, 4, '收件箱里不允许出现两行完全相同的任务');
		assert.equal(content.match(/🆔/g)?.length, 1);

		// 新建的任务立刻可以被既有的严格写入路径改写
		const target = taskLines.find((line) => line.startsWith('- [ ] 买菜'))!;
		const parsed = parseTaskLine(target, 'Time Grid Tasks.md', 0, created, DEFAULT_TASK_SETTINGS.goalTag);
		const doneRaw = serializeStatusChange(parsed, 'done', DEFAULT_TASK_SETTINGS, created);
		const edited = applyTaskEditToContent(content, parsed, doneRaw);
		assert.equal(edited.result.ok, true, '新建的任务应当能被原文唯一定位并改写');
		await writeFile(inboxPath, edited.content); writes++;
		content = await readFile(inboxPath, 'utf8');
		assert.match(content, /- \[x\] 买菜 ➕ 2026-09-03 📅 2026-09-03 ✅ 2026-09-03/);

		// 撞 ID 的两条也必须都能被唯一定位
		const duplicated = content.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- [ ] 写周报'));
		assert.equal(duplicated.length, 2);
		for (const line of duplicated) {
			const task = parseTaskLine(line, 'Time Grid Tasks.md', 0, created, DEFAULT_TASK_SETTINGS.goalTag);
			assert.equal(applyTaskEditToContent(content, task, line.replace('- [ ]', '- [/]')).result.ok, true);
		}

		// 外部编辑保留：插槽之外的内容不受影响
		const withNotes = `${content}\n## 我自己的笔记\n随手写的内容\n`;
		await writeFile(inboxPath, withNotes);
		await processFile(inboxPath, (content) => appendTaskToInbox(content, { description: '之后的事', created })); writes++;
		content = await readFile(inboxPath, 'utf8');
		assert.match(content, /## 我自己的笔记\n随手写的内容/);
		assert.ok(content.indexOf('- [ ] 之后的事') < content.indexOf(TASK_SLOT_END));

		// CRLF 收件箱保持行尾不变
		const crlfPath = join(vault, 'CRLF Inbox.md');
		await writeFile(crlfPath, createInboxScaffold('CRLF Inbox', '\r\n'));
		await processFile(crlfPath, (content) => appendTaskToInbox(content, { description: 'CRLF 任务', created })); writes++;
		const crlfContent = await readFile(crlfPath, 'utf8');
		assert.match(crlfContent, /- \[ \] CRLF 任务 ➕ 2026-09-03\r\n/);
		assert.ok(!/[^\r]\n/.test(crlfContent), 'CRLF 文件中不应混入 LF');

		// 插槽被复制或删除时一律拒写，原文一字不动
		const brokenPath = join(vault, 'Broken Inbox.md');
		const broken = `${createInboxScaffold('Broken')}${createInboxScaffold('Broken')}`;
		await writeFile(brokenPath, broken);
		const rejected = await processFile(brokenPath, (content) => appendTaskToInbox(content, { description: '不该写入', created }));
		assert.ok(rejected.error);
		assert.equal(await readFile(brokenPath, 'utf8'), broken);

		execFileSync('git', ['diff', '--check'], { cwd: vault, stdio: 'inherit' });
		console.log(`✓ temporary Git vault completed ${writes} inbox writes, added ids only on collision, and refused broken slots`);
	} finally {
		await rm(vault, { recursive: true, force: true });
	}
}

async function processFile(
	path: string,
	mutate: (content: string) => InboxMutation
): Promise<InboxMutation> {
	const current = await readFile(path, 'utf8');
	const mutation = mutate(current);
	if (!mutation.error && mutation.changed) await writeFile(path, mutation.content);
	return mutation;
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
