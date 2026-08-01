import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoutineDocument } from '../src/types/routine';
import { DEFAULT_TASK_SETTINGS } from '../src/types/task';
import {
	insertRoutineInstancesAtSlot,
	parseRoutineInstances,
	replaceLegacyRoutineWithSlot,
	routineDocumentFromLegacy,
	serializeRoutineDocument,
} from '../src/utils/routineFormat';
import { applyTaskEditToContent, serializeStatusChange, serializeTaskPatch } from '../src/utils/taskWriter';

async function main(): Promise<void> {
	const vault = await mkdtemp(join(tmpdir(), 'time-grid-routine-vault-'));
	let writes = 0;
	try {
	const templates = join(vault, '00-Templates');
	const backups = join(templates, '副本保留');
	const daily = join(vault, '02-Daily Notes');
	await mkdir(backups, { recursive: true });
	await mkdir(daily, { recursive: true });
	const templatePath = join(templates, 'Daily.md.md');
	const definitionPath = join(templates, 'Time Grid Routines.md');
	const dailyPath = join(daily, '2026-08-03.md');
	const legacyTemplate = '# Daily\r\n\r\n> [!CHECK] :LiRotateCw: 每日流程\r\n> - [ ] 吃药\r\n> - [ ] 今日 AI 资讯\r\n\r\n## 其他\r\n';
	await writeFile(templatePath, legacyTemplate);
	await writeFile(dailyPath, '<!-- time-grid-routine-slot:start -->\r\n<!-- time-grid-routine-slot:end -->\r\n');
	execFileSync('git', ['init', '-q'], { cwd: vault });
	execFileSync('git', ['config', 'core.whitespace', 'cr-at-eol'], { cwd: vault });
	execFileSync('git', ['add', '.'], { cwd: vault });
	execFileSync('git', ['-c', 'user.name=Time Grid Test', '-c', 'user.email=time-grid@example.invalid', 'commit', '-qm', 'baseline'], { cwd: vault });

	const document = routineDocumentFromLegacy(legacyTemplate);
	const replacement = replaceLegacyRoutineWithSlot(legacyTemplate);
	assert.equal(replacement.changed, true);
	await copyFile(templatePath, join(backups, 'Daily.backup.md')); writes++;
	await writeFile(definitionPath, serializeRoutineDocument(document)); writes++;
	await writeFile(templatePath, replacement.content); writes++;

	const inserted = insertRoutineInstancesAtSlot(await readFile(dailyPath, 'utf8'), document, '2026-08-03');
	assert.equal(inserted.changed, true);
	await writeFile(dailyPath, inserted.content); writes++;

	for (let index = 0; index < 12; index++) {
		const content = await readFile(dailyPath, 'utf8');
		const instance = parseRoutineInstances(content, '02-Daily Notes/2026-08-03.md', '2026-08-03', document, '#goal').instances[0];
		const status = index % 2 === 0 ? 'done' : 'todo';
		const edited = applyTaskEditToContent(content, instance.task, serializeStatusChange(instance.task, status, DEFAULT_TASK_SETTINGS, '2026-08-03'));
		assert.equal(edited.result.ok, true);
		await writeFile(dailyPath, edited.content); writes++;
	}

	for (let index = 0; index < 4; index++) {
		const content = await readFile(dailyPath, 'utf8');
		const instance = parseRoutineInstances(content, '02-Daily Notes/2026-08-03.md', '2026-08-03', document, '#goal').instances[1];
		const raw = serializeTaskPatch(instance.task, { description: `今日 AI 资讯 ${index + 1}`, routineReminderTime: `0${index + 6}:30` }, DEFAULT_TASK_SETTINGS);
		const edited = applyTaskEditToContent(content, instance.task, raw);
		assert.equal(edited.result.ok, true);
		await writeFile(dailyPath, edited.content); writes++;
	}

	let plan: RoutineDocument = document;
	for (let index = 0; index < 4; index++) {
		plan = {
			version: 1,
			groups: plan.groups.map((group) => ({
				...group,
				subtitle: `计划版本 ${index + 1}`,
				items: group.items.map((item, order) => ({ ...item, order: group.items.length - order - 1 })),
			})),
		};
		await writeFile(definitionPath, serializeRoutineDocument(plan)); writes++;
	}

	assert.equal(writes >= 20, true);
	const beforeConcurrentEdit = await readFile(dailyPath, 'utf8');
	const stale = parseRoutineInstances(beforeConcurrentEdit, '02-Daily Notes/2026-08-03.md', '2026-08-03', document, '#goal').instances[0].task;
	const externallyChanged = beforeConcurrentEdit.replace(stale.raw, stale.raw.replace('吃药', '吃药（编辑器并发修改）'));
	await writeFile(dailyPath, externallyChanged);
	const rejected = applyTaskEditToContent(externallyChanged, stale, serializeStatusChange(stale, 'done', DEFAULT_TASK_SETTINGS, '2026-08-03'));
	assert.equal(rejected.result.ok, false);
	assert.equal(rejected.content, externallyChanged);

	execFileSync('git', ['diff', '--check'], { cwd: vault, stdio: 'inherit' });
	console.log(`✓ temporary Git vault completed ${writes} routine writes and rejected a concurrent stale edit`);
	} finally {
		await rm(vault, { recursive: true, force: true });
	}
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
