#!/usr/bin/env node
/**
 * tg —— TimeGrid CLI
 *
 * 入口：解析子命令，调对应处理函数。
 * MVP 子命令：today / where（其他先 stub 占位，避免误用）。
 */

import { locateVault } from './vault.js';
import { scanVault } from './parser.js';
import { classify, sortByPriorityThenDue } from './classify.js';
import { renderSections } from './layout.js';
import { renderHtml } from './html.js';
import { writeHtml } from './writer.js';
import { buildObsidianUri } from './obsidian.js';

type Command = (args: string[]) => Promise<void>;

const today: Command = async () => {
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const cols = classify(result.tasks);
	const out = renderSections(
		[
			{ title: '今日', tasks: cols.today },
			{ title: '逾期', tasks: cols.overdue },
		],
		{
			scanMs: result.scanMs,
			filesScanned: result.filesScanned,
			tasksTotal: result.tasks.length,
		},
	);
	process.stdout.write(out + '\n');
};

const where: Command = async () => {
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const cols = classify(result.tasks);
	process.stdout.write(
		[
			`vault:       ${vault}`,
			`扫了:        ${result.filesScanned} 个 .md`,
			`任务总数:    ${result.tasks.length}（含 done / cancelled）`,
			`今日列:      ${cols.today.length}`,
			`逾期列:      ${cols.overdue.length}`,
			`耗时:        ${(result.scanMs / 1000).toFixed(2)}s`,
			'',
			'obsidian:// 示例（不会自动调起）：',
			`  ${cols.today[0] ? buildObsidianUri(vault, cols.today[0].filePath) : '(今日列为空)'}`,
		].join('\n') + '\n',
	);
};

const overdue: Command = async () => {
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const overdue = sortByPriorityThenDue(
		result.tasks.filter(
			(t) =>
				t.section === 'overdue' &&
				t.status !== 'done' &&
				t.status !== 'cancelled',
		),
		'desc',
	);
	const out = renderSections([{ title: '已过期', tasks: overdue }], {
		scanMs: result.scanMs,
		filesScanned: result.filesScanned,
		tasksTotal: result.tasks.length,
	});
	process.stdout.write(out + '\n');
};

const upcoming: Command = async (args) => {
	const days = Number(args[0] ?? '7');
	if (!Number.isFinite(days) || days <= 0) {
		process.stderr.write(`非法 days: ${args[0]}\n`);
		process.exit(2);
	}
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const future = sortByPriorityThenDue(
		result.tasks.filter((t) => {
			if (t.status === 'done' || t.status === 'cancelled') return false;
			if (t.section !== 'future') return false;
			if (!t.due) return true;
			const today = new Date();
			const due = new Date(t.due);
			const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
			return diff <= days;
		}),
		'asc',
	);
	const out = renderSections([{ title: `未来 ${days} 天`, tasks: future }], {
		scanMs: result.scanMs,
		filesScanned: result.filesScanned,
		tasksTotal: result.tasks.length,
	});
	process.stdout.write(out + '\n');
};

const search: Command = async (args) => {
	const keyword = args.join(' ').trim();
	if (!keyword) {
		process.stderr.write('用法: tg search <keyword>\n');
		process.exit(2);
	}
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const matched = result.tasks.filter((t) =>
		t.description.toLowerCase().includes(keyword.toLowerCase()),
	);
	const out = renderSections([{ title: `搜 "${keyword}"`, tasks: matched }], {
		scanMs: result.scanMs,
		filesScanned: result.filesScanned,
		tasksTotal: result.tasks.length,
	});
	process.stdout.write(out + '\n');
};

const html: Command = async () => {
	const vault = await locateVault();
	const result = await scanVault({ vaultPath: vault });
	const cols = classify(result.tasks);
	const todayStr = new Date().toISOString().slice(0, 10);
	const out = renderHtml({
		vault,
		today: todayStr,
		sections: [
			{ title: '今日', tasks: cols.today },
			{ title: '逾期', tasks: cols.overdue },
		],
		stats: {
			filesScanned: result.filesScanned,
			tasksTotal: result.tasks.length,
			scanMs: result.scanMs,
		},
	});
	const path = await writeHtml(out);
	// 用 macOS open 命令在默认浏览器打开
	// Shortcuts 的 Show Web View 不支持 file://，所以直接 open 更可靠
	const { exec } = await import('node:child_process');
	exec(`open "${path}"`, (err) => {
		if (err) {
			process.stderr.write(`自动打开失败，请手动打开: ${path}\n`);
		}
	});
	process.stdout.write(`${path}\n`);
};

const help: Command = async () => {
	process.stdout.write(
		[
			'tg —— TimeGrid CLI',
			'',
			'用法:',
			'  tg today                显示今日 + 逾期（纯文本，终端用）',
			'  tg html                 输出 HTML 到 $TMPDIR/timegrid-today.html（给 Shortcuts 用）',
			'  tg where                显示 vault 路径 + 统计',
			'  tg overdue              只显示过期任务',
			'  tg upcoming [days]      显示未来 days 天（默认 7）',
			'  tg search <keyword>     搜任务描述',
			'',
			'环境:',
			'  TG_VAULT=/path/to/vault  显式指定 vault 路径',
			'',
			'修改布局：编辑 src/layout.ts（纯文本）/ src/html.ts（HTML）',
		].join('\n') + '\n',
	);
};

const commands: Record<string, Command> = {
	today,
	html,
	where,
	overdue,
	upcoming,
	search,
	help,
	'--help': help,
	'-h': help,
};

async function main(): Promise<void> {
	const [cmd, ...rest] = process.argv.slice(2);
	const handler = (cmd ? commands[cmd] : undefined) ?? help;
	try {
		await handler(rest);
	} catch (err) {
		process.stderr.write(`错误: ${(err as Error).message}\n`);
		process.exit(1);
	}
}

main();
