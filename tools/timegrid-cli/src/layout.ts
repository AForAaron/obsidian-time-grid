/**
 * 单列纵向布局（适合 Shortcuts 的窄弹窗）。
 *
 * 设计：
 *   - 顶部一行：日期 + 统计
 *   - 多个 section 纵向堆叠：标题 (n) + 分隔线 + 任务列表
 *   - 每个任务：`P1 [ ] 描述  MM-DD`（P1-P5 标签 + ANSI 颜色）
 *
 * Shortcuts 的 Show Output 弹窗大约 30-40 字符宽，双列会被强制换行。
 * 单列在任何宽度下都工整。
 */

import type { TGTask, TaskPriority } from '@timegrid/task-types';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
	highest: 'P1',
	high: 'P2',
	medium: 'P3',
	low: 'P4',
	lowest: 'P5',
};

// ANSI 颜色：P1=亮红 P2=亮黄 P3=亮青 P4=亮灰 P5=暗灰
const PRIORITY_COLOR: Record<TaskPriority, string> = {
	highest: '\x1b[91m',
	high: '\x1b[93m',
	medium: '\x1b[96m',
	low: '\x1b[37m',
	lowest: '\x1b[90m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export interface Section {
	title: string;
	tasks: TGTask[];
}

export interface LayoutOptions {
	terminalWidth?: number;
	scanMs?: number;
	filesScanned?: number;
	tasksTotal?: number;
	today?: string;
	color?: boolean;
}

export function renderSections(sections: Section[], opts: LayoutOptions = {}): string {
	// Shortcuts 的 Show Output 是纯文本，不解析 ANSI，所以默认关颜色
	// 想要颜色：用 Alfred / Raycast / 真终端 跑 tg
	const useColor = opts.color ?? process.stdout.isTTY === true;
	const today = opts.today ?? new Date().toISOString().slice(0, 10);
	const width = detectWidth(opts);

	// 顶部统计
	const stats: string[] = [];
	if (opts.filesScanned !== undefined) stats.push(`${opts.filesScanned} 文件`);
	if (opts.tasksTotal !== undefined) stats.push(`${opts.tasksTotal} 任务`);
	if (opts.scanMs !== undefined) stats.push(`${(opts.scanMs / 1000).toFixed(2)}s`);
	const header = stats.length > 0 ? `${today}  ·  ${stats.join('  ·  ')}` : today;

	const lines: string[] = [];
	lines.push(useColor ? `${BOLD}${header}${RESET}` : header);
	lines.push('');

	for (const section of sections) {
		lines.push(useColor ? `${BOLD}${section.title} (${section.tasks.length})${RESET}` : `${section.title} (${section.tasks.length})`);
		lines.push('─'.repeat(width));
		if (section.tasks.length === 0) {
			lines.push(useColor ? `  ${DIM}(空)${RESET}` : '  (空)');
		} else {
			for (const task of section.tasks) {
				lines.push(renderTaskLine(task, width, useColor));
			}
		}
		lines.push('');
	}

	while (lines.length > 0 && lines[lines.length - 1] === '') {
		lines.pop();
	}

	return lines.join('\n');
}

function renderTaskLine(t: TGTask, width: number, useColor: boolean): string {
	const label = t.priority ? PRIORITY_LABEL[t.priority] : '  ';
	const labelCell = label + ' '; // 3 chars

	const desc = stripPrefix(t.description);
	const due = t.due ? t.due.slice(5) : '';
	const duePart = due ? `  ${due}` : '';

	// 固定前缀：3 (label) + 3 ([ ]) + 1 (空格) = 7
	const fixedLen = labelCell.length + 3 + 1 + duePart.length;
	const descMax = Math.max(8, width - fixedLen);
	const descTruncated = truncate(desc, descMax);

	const plain = `${labelCell}[ ] ${descTruncated}${duePart}`;
	if (useColor && t.priority) {
		return `${PRIORITY_COLOR[t.priority]}${plain}${RESET}`;
	}
	return plain;
}

function detectWidth(opts: LayoutOptions): number {
	if (opts.terminalWidth) return opts.terminalWidth;
	const env = process.stdout.columns ?? process.stderr.columns;
	// Shortcuts 的 Show Output 弹窗很窄（~35 字符），process.stdout.columns 是 0
	// 默认给个适中的宽度，避免在弹窗里被强制换行
	if (!env || env < 40) return 36;
	return env;
}

function truncate(s: string, width: number): string {
	const vis = visibleLength(s);
	if (vis <= width) return s;
	if (width <= 1) return s.slice(0, width);
	return s.slice(0, width - 1) + '…';
}

function stripPrefix(desc: string): string {
	return desc
		.replace(/==\*+/g, '')
		.replace(/\*+==/g, '')
		.replace(/==/g, '')
		.replace(/^\s*\[!CHECK\]\s*/i, '')
		.trim();
}

function visibleLength(s: string): number {
	return [...s].length;
}
