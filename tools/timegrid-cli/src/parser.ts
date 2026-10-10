/**
 * 扫 vault 内的所有 .md，过滤掉 excludedPaths，调用 taskParser 解析每行。
 *
 * 这是 CLI 唯一与 TimeGrid 插件源码耦合的地方：通过 tsconfig 的 paths
 * 直接 import `src/utils/taskParser.ts`，所以 plugin 改字段时这里自动同步。
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { parseTaskLine } from '@timegrid/task-core';
import type { TGTask } from '@timegrid/task-types';

const DEFAULT_EXCLUDED = '00-Templates';

export interface ScanOptions {
	vaultPath: string;
	excludedPaths?: string;
	goalTag?: string;
	today?: string;
}

export interface ScanResult {
	tasks: TGTask[];
	filesScanned: number;
	filesWithTasks: number;
	scanMs: number;
}

function isExcluded(filePath: string, excluded: string): boolean {
	return excluded
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.some((segment) => filePath.includes(segment));
}

function todayISO(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export async function scanVault(opts: ScanOptions): Promise<ScanResult> {
	const start = Date.now();
	const excluded = opts.excludedPaths ?? DEFAULT_EXCLUDED;
	const goalTag = opts.goalTag ?? '#goal';
	const today = opts.today ?? todayISO();

	const tasks: TGTask[] = [];
	let filesScanned = 0;
	let filesWithTasks = 0;

	const stack: string[] = [opts.vaultPath];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry === '.obsidian' || entry === '.trash' || entry.startsWith('.')) {
				continue;
			}
			const full = join(dir, entry);
			const rel = relative(opts.vaultPath, full);
			if (isExcluded(rel, excluded)) continue;

			let stat: import('node:fs').Stats | null = null;
			try {
				stat = await import('node:fs/promises').then((m) => m.stat(full));
			} catch {
				continue;
			}
			if (!stat) continue;
			if (stat.isDirectory()) {
				stack.push(full);
			} else if (stat.isFile() && entry.endsWith('.md')) {
				filesScanned += 1;
				const fileTasks = await parseFile(full, rel, today, goalTag);
				if (fileTasks.length > 0) {
					filesWithTasks += 1;
					tasks.push(...fileTasks);
				}
			}
		}
	}

	return {
		tasks,
		filesScanned,
		filesWithTasks,
		scanMs: Date.now() - start,
	};
}

async function parseFile(
	absPath: string,
	relPath: string,
	today: string,
	goalTag: string,
): Promise<TGTask[]> {
	let content: string;
	try {
		content = await readFile(absPath, 'utf8');
	} catch {
		return [];
	}
	const lines = content.split(/\r?\n/);
	const out: TGTask[] = [];
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		// 跳过纯 blockquote 包裹的任务（插件会处理，但 CLI 暂不展示 callout 内的）
		if (/^\s*>/.test(raw)) continue;
		if (!/^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]/.test(raw)) continue;
		const task = parseTaskLine(raw, relPath, i + 1, today, goalTag);
		if (task.diagnostics.some((d) => d.blocking)) continue;
		out.push(task);
	}
	return out;
}
