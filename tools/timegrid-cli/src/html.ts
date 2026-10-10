/**
 * 自包含 HTML 渲染器。
 *
 * 设计：
 *   - 内联所有 CSS，零外部依赖（断网也能用）
 *   - 跟随系统深浅模式（@media prefers-color-scheme）
 *   - P1-P5 颜色梯度（最高 红色 → 最低 暗灰）
 *   - 每个任务可点击，href 指向 obsidian:// 自动跳到对应文件
 *   - 描述过长 ellipsis 截断，不破坏布局
 */

import type { TGTask, TaskPriority } from '@timegrid/task-types';
import { buildObsidianUri } from './obsidian.js';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
	highest: 'P1',
	high: 'P2',
	medium: 'P3',
	low: 'P4',
	lowest: 'P5',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
	highest: 'p1',
	high: 'p2',
	medium: 'p3',
	low: 'p4',
	lowest: 'p5',
};

export interface HtmlSection {
	title: string;
	tasks: TGTask[];
}

export interface HtmlStats {
	filesScanned: number;
	tasksTotal: number;
	scanMs: number;
}

export interface HtmlOptions {
	vault: string;
	today: string;
	sections: HtmlSection[];
	stats: HtmlStats;
}

const CSS = `
:root {
	color-scheme: light dark;
	--bg: #1e1e1e;
	--fg: #e9ecef;
	--muted: #868e96;
	--border: rgba(255, 255, 255, 0.08);
	--hover: rgba(255, 255, 255, 0.05);
	--link: #74c0fc;
}
@media (prefers-color-scheme: light) {
	:root {
		--bg: #ffffff;
		--fg: #212529;
		--muted: #6c757d;
		--border: rgba(0, 0, 0, 0.08);
		--hover: rgba(0, 0, 0, 0.04);
		--link: #1971c2;
	}
}
* { box-sizing: border-box; }
body {
	font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
	background: var(--bg);
	color: var(--fg);
	margin: 0;
	padding: 20px;
	max-width: 720px;
	margin-left: auto;
	margin-right: auto;
}
header {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	margin-bottom: 20px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--border);
}
h1 {
	font-size: 18px;
	font-weight: 600;
	margin: 0;
	letter-spacing: -0.2px;
}
.stats {
	color: var(--muted);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
section { margin-bottom: 24px; }
h2 {
	font-size: 11px;
	font-weight: 600;
	color: var(--muted);
	text-transform: uppercase;
	letter-spacing: 0.6px;
	margin: 0 0 8px 0;
}
ul { list-style: none; margin: 0; padding: 0; }
li { border-bottom: 1px solid var(--border); }
li:last-child { border-bottom: none; }
a.task {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 6px;
	text-decoration: none;
	color: var(--fg);
	border-radius: 4px;
	transition: background 0.1s ease;
}
a.task:hover { background: var(--hover); }
a.task:focus { background: var(--hover); outline: 2px solid var(--link); outline-offset: -2px; }
.prio {
	width: 32px;
	flex-shrink: 0;
	font-weight: 700;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	text-align: center;
	letter-spacing: 0.3px;
}
.noprio { color: var(--muted); font-weight: 400; }
.p1 { color: #ff5555; }
.p2 { color: #f59f00; }
.p3 { color: #22b8cf; }
.p4 { color: #adb5bd; }
.p5 { color: #6c757d; }
@media (prefers-color-scheme: light) {
	.p1 { color: #c92a2a; }
	.p2 { color: #b45309; }
	.p3 { color: #0c8599; }
	.p4 { color: #6c757d; }
	.p5 { color: #adb5bd; }
}
.checkbox {
	width: 16px;
	flex-shrink: 0;
	color: var(--muted);
	text-align: center;
	font-size: 14px;
}
.desc {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.due {
	color: var(--muted);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	flex-shrink: 0;
}
.empty {
	color: var(--muted);
	font-style: italic;
	padding: 8px 6px;
	list-style: none;
}
footer {
	color: var(--muted);
	font-size: 12px;
	text-align: center;
	margin-top: 24px;
	padding-top: 12px;
	border-top: 1px solid var(--border);
}
`;

export function renderHtml(opts: HtmlOptions): string {
	const stats = `${opts.stats.scanMs.toFixed(2)}s · ${opts.stats.filesScanned} 文件 · ${opts.stats.tasksTotal} 任务`;
	const sections = opts.sections
		.map((s) => renderSection(s, opts.vault))
		.join('\n');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TimeGrid · ${escapeHtml(opts.today)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>TimeGrid · ${escapeHtml(opts.today)}</h1>
  <div class="stats">${escapeHtml(stats)}</div>
</header>
${sections}
<footer>按 ⏎ 或点任务在 Obsidian 中打开</footer>
</body>
</html>
`;
}

function renderSection(section: HtmlSection, vault: string): string {
	const items =
		section.tasks.length === 0
			? `<li class="empty">(空)</li>`
			: section.tasks.map((t) => renderTask(t, vault)).join('\n    ');
	return `<section>
  <h2>${escapeHtml(section.title)} (${section.tasks.length})</h2>
  <ul>
    ${items}
  </ul>
</section>`;
}

function renderTask(t: TGTask, vault: string): string {
	const prioClass = t.priority ? PRIORITY_CLASS[t.priority] : 'noprio';
	const prioLabel = t.priority ? PRIORITY_LABEL[t.priority] : '—';
	const due = t.due ? t.due.slice(5) : '';
	const href = buildObsidianUri(vault, t.filePath);
	const desc = stripMarkdown(t.description);
	const dueHtml = due ? `<span class="due">${escapeHtml(due)}</span>` : '';
	return `<li>
    <a class="task" href="${escapeAttr(href)}">
      <span class="prio ${prioClass}">${prioLabel}</span>
      <span class="checkbox">☐</span>
      <span class="desc">${escapeHtml(desc)}</span>
      ${dueHtml}
    </a>
  </li>`;
}

function stripMarkdown(desc: string): string {
	return desc
		.replace(/==\*+/g, '')
		.replace(/\*+==/g, '')
		.replace(/==/g, '')
		.replace(/^\s*\[!CHECK\]\s*/i, '')
		.trim();
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
	return escapeHtml(s);
}
