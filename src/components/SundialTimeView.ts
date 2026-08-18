import { App, Notice, TFile } from 'obsidian';
import { DurationBucket, aggregateDurations, getDailyNoteFilename, parseSimpleTimeTracker } from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';
import { TimerController } from '../utils/timerController';
import { TimeRange, TimerActionResult, TimerSnapshot, TimerSuggestionSource } from '../types/timer';
import { HEATMAP_RANGES, WritingStatsTracker } from '../utils/writingStats';

interface SundialTimeViewOptions {
	getRange: () => TimeRange;
	saveRange: (range: TimeRange) => Promise<void>;
	onDateClick: (date: Date) => void;
	onOpenToday: () => void;
}

type ButtonVariant = 'primary' | 'neutral' | 'danger-quiet' | 'quiet';

const PLAY_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 4l14 8-14 8z"></path></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"></rect></svg>';

interface HeatDay {
	date: Date;
	dateKey: string;
	durationMs: number;
	wordCount: number;
	level: number;
	isToday: boolean;
	isFuture: boolean;
}

interface DisplayBucket extends DurationBucket {
	key: string;
	colorIndex: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVITY_ROWS = 5;

export class SundialTimeView {
	private app: App;
	private writingStats: WritingStatsTracker;
	private timerController: TimerController;
	private options: SundialTimeViewOptions;
	private root: HTMLElement;
	private trendBlock: HTMLElement;
	private monthBlock: HTMLElement;
	private dialDayPath: SVGPathElement;
	private dialHourPath: SVGPathElement;
	private dialNowDot: SVGCircleElement;
	private clock: HTMLElement;
	private dialSummary: HTMLElement;
	private timerPanel: HTMLElement;
	private activityBlock: HTMLElement;
	private rangeButtons = new Map<TimeRange, HTMLButtonElement>();
	private range: TimeRange;
	private lastCalendarKey = '';
	private lastHeatKey = '';
	private heatRefreshInFlight = false;
	private heatCache = new Map<string, { mtime: number; content: string }>();
	private activityCache: { path: string; mtime: number; content: string } | null = null;
	private timerUnsubscribe: (() => void) | null = null;
	private actionBusy = false;
	private timerElapsed: HTMLElement | null = null;
	private switchMessage = '';
	private tooltip: HTMLElement;

	constructor(
		parent: HTMLElement,
		app: App,
		writingStats: WritingStatsTracker,
		timerController: TimerController,
		options: SundialTimeViewOptions
	) {
		this.app = app;
		this.writingStats = writingStats;
		this.timerController = timerController;
		this.options = options;
		this.range = options.getRange();
		this.root = parent.createDiv('tg-sundial-root');

		const context = this.root.createDiv('tg-sundial-context');
		this.trendBlock = context.createEl('section', { cls: 'tg-sundial-context-block tg-sundial-trend' });
		this.createTrendHeader();
		this.monthBlock = context.createEl('section', { cls: 'tg-sundial-context-block tg-sundial-month' });

		const nowZone = this.root.createEl('section', { cls: 'tg-sundial-now-zone' });
		const dialPanel = nowZone.createDiv('tg-sundial-dial-panel');
		const dialHeader = dialPanel.createDiv('tg-sundial-dial-header');
		dialHeader.createDiv({ cls: 'tg-sundial-section-label', text: '此刻' });
		dialHeader.createDiv({ cls: 'tg-sundial-section-meta', text: '今日 · 当前小时' });
		const svg = this.createDial();
		dialPanel.appendChild(svg);
		const caption = dialPanel.createDiv('tg-sundial-dial-caption');
		this.clock = caption.createDiv('tg-sundial-clock');
		this.dialSummary = caption.createDiv('tg-sundial-dial-summary');
		this.timerPanel = nowZone.createEl('section', { cls: 'tg-timer-panel' });

		this.activityBlock = this.root.createEl('section', { cls: 'tg-sundial-activity' });
		this.tooltip = this.root.createDiv('tg-sundial-tooltip');
		this.tooltip.hide();

		this.timerUnsubscribe = this.timerController.onChange(() => {
			this.renderTimerPanel();
			void this.refreshActivity(new Date(), true);
		});
		this.renderTimerPanel();
	}

	update(now: Date): void {
		this.timerController.tick(now);
		this.updateDial(now);
		this.updateTimerElapsed(now);
		this.renderMonthIfNeeded(now);
		this.refreshHeatIfNeeded(now);
		void this.refreshActivity(now, false);
	}

	destroy(): void {
		this.timerUnsubscribe?.();
		this.tooltip.remove();
	}

	private createTrendHeader(): void {
		const header = this.trendBlock.createDiv('tg-sundial-section-head');
		header.createDiv({ cls: 'tg-sundial-section-label', text: '长期轨迹' });
		const ranges = header.createDiv('tg-sundial-range-switch');
		([
			['3m', '3个月'],
			['6m', '6个月'],
			['1y', '1年'],
		] as Array<[TimeRange, string]>).forEach(([range, label]) => {
			const button = ranges.createEl('button', {
				cls: 'tg-sundial-range-button',
				text: label,
				attr: { type: 'button', 'aria-label': `显示${label}活动轨迹` },
			});
			button.toggleClass('is-active', this.range === range);
			button.addEventListener('click', () => {
				if (this.range === range) return;
				this.range = range;
				for (const [key, candidate] of this.rangeButtons) candidate.toggleClass('is-active', key === range);
				this.lastHeatKey = '';
				this.refreshHeatIfNeeded(new Date());
				void this.options.saveRange(range);
			});
			this.rangeButtons.set(range, button);
		});
	}

	private renderMonthIfNeeded(now: Date): void {
		const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
		if (key === this.lastCalendarKey) return;
		this.lastCalendarKey = key;
		const previousHeader = this.monthBlock.querySelector('.tg-sundial-section-head');
		this.monthBlock.empty();
		previousHeader?.remove();
		const header = this.monthBlock.createDiv('tg-sundial-section-head');
		header.createDiv({ cls: 'tg-sundial-section-label', text: '本月位置' });
		header.createDiv({ cls: 'tg-sundial-section-meta', text: `${now.getMonth() + 1}月 · 第${now.getDate()}天` });
		const grid = this.monthBlock.createDiv('tg-sundial-calendar');
		['日', '一', '二', '三', '四', '五', '六'].forEach((label) => grid.createDiv({ cls: 'tg-sundial-calendar-weekday', text: label }));
		const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
		const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		for (let index = 0; index < firstDay; index++) grid.createSpan('tg-sundial-calendar-day is-empty');
		for (let day = 1; day <= dayCount; day++) {
			const date = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0);
			const button = grid.createEl('button', {
				cls: 'tg-sundial-calendar-day',
				text: String(day),
				attr: { type: 'button', 'aria-label': `${now.getMonth() + 1}月${day}日` },
			});
			button.addClass(day < now.getDate() ? 'is-past' : day === now.getDate() ? 'is-today' : 'is-future');
			button.addEventListener('click', () => this.options.onDateClick(date));
		}
	}

	private refreshHeatIfNeeded(now: Date): void {
		const key = `${getDailyNoteFilename(now)}-${this.range}-${this.writingStats.getRevision()}`;
		if (key === this.lastHeatKey || this.heatRefreshInFlight) return;
		this.lastHeatKey = key;
		this.heatRefreshInFlight = true;
		void this.refreshHeat(now).finally(() => {
			this.heatRefreshInFlight = false;
		});
	}

	private async refreshHeat(now: Date): Promise<void> {
		const weeks = HEATMAP_RANGES[this.range].weeks;
		const dates = heatDates(now, weeks);
		const raw: Array<Omit<HeatDay, 'level'>> = [];
		let activeDays = 0;
		let maxDuration = 0;
		let totalWords = 0;
		for (const date of dates) {
			const dateKey = getDailyNoteFilename(date);
			const durationMs = await this.durationForDate(date, now);
			const wordCount = this.writingStats.getWordCountForDate(dateKey);
			const isFuture = startOfDay(date).getTime() > startOfDay(now).getTime();
			const isToday = sameDate(date, now);
			if (durationMs > 0) {
				activeDays++;
				maxDuration = Math.max(maxDuration, durationMs);
			}
			totalWords += wordCount;
			raw.push({ date, dateKey, durationMs, wordCount, isToday, isFuture });
		}
		const days: HeatDay[] = raw.map((day) => ({ ...day, level: heatLevel(day.durationMs, maxDuration) }));
		this.renderHeat(days, activeDays, totalWords);
	}

	private renderHeat(days: HeatDay[], activeDays: number, totalWords: number): void {
		for (const child of Array.from(this.trendBlock.children)) {
			if (!child.classList.contains('tg-sundial-section-head')) child.remove();
		}
		const layout = this.trendBlock.createDiv('tg-sundial-heat-layout');
		const weekdays = layout.createDiv('tg-sundial-heat-weekdays');
		['一', '', '三', '', '五', '', '日'].forEach((label) => weekdays.createSpan({ text: label }));
		const scroll = layout.createDiv('tg-sundial-heat-scroll');
		const grid = scroll.createDiv('tg-sundial-heat-grid');
		for (const day of days) {
			const cell = grid.createEl('button', {
				cls: `tg-sundial-heat-cell level-${day.level}`,
				attr: {
					type: 'button',
					'aria-label': `${day.dateKey} · ${formatHeatValue(day.durationMs, day.wordCount)}`,
				},
			});
			if (day.isFuture) {
				cell.addClass('is-future');
				cell.disabled = true;
			}
			if (day.isToday) cell.addClass('is-today');
			if (!day.isFuture) {
				cell.addEventListener('click', () => this.options.onDateClick(day.date));
				cell.addEventListener('mouseenter', (event) => this.showTooltip(event, day));
				cell.addEventListener('mousemove', (event) => this.moveTooltip(event));
				cell.addEventListener('mouseleave', () => this.tooltip.hide());
			}
		}
		this.trendBlock.createDiv({ cls: 'tg-sundial-section-meta tg-sundial-heat-summary', text: `记录 ${activeDays} 天 · 净增 ${Math.round(totalWords).toLocaleString()}字` });
		const legend = this.trendBlock.createDiv('tg-sundial-heat-legend');
		legend.createSpan({ text: '少' });
		const cells = legend.createSpan('tg-sundial-heat-legend-cells');
		for (let level = 0; level <= 4; level++) cells.createSpan(`tg-sundial-heat-legend-cell level-${level}`);
		legend.createSpan({ text: '多' });
		window.requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });
	}

	private async durationForDate(date: Date, now: Date): Promise<number> {
		const file = getDailyNoteFileForDate(this.app, date);
		if (!file) return 0;
		const cached = this.heatCache.get(file.path);
		let content = cached?.content;
		if (!cached || cached.mtime !== file.stat.mtime) {
			content = await this.app.vault.cachedRead(file);
			this.heatCache.set(file.path, { mtime: file.stat.mtime, content });
		}
		const parsed = parseSimpleTimeTracker(content ?? '');
		if (parsed.status !== 'ok') return 0;
		const reference = sameDate(date, now) ? now : endOfDay(date);
		return aggregateDurations(parsed.data, reference, startOfDay(date), endOfDay(date)).reduce((sum, bucket) => sum + bucket.durationMs, 0);
	}

	private createDial(): SVGSVGElement {
		const svg = svgElement('svg');
		svg.setAttribute('viewBox', '0 0 280 148');
		svg.setAttribute('class', 'tg-sundial-dial');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', '今日与当前小时的时间进度');
		svg.appendChild(dialPath('tg-sundial-dial-track', 106, 6));
		this.dialDayPath = dialPath('tg-sundial-dial-day', 106, 6);
		svg.appendChild(this.dialDayPath);
		svg.appendChild(dialPath('tg-sundial-dial-track', 72, 5));
		this.dialHourPath = dialPath('tg-sundial-dial-hour', 72, 5);
		svg.appendChild(this.dialHourPath);
		this.dialNowDot = svgElement('circle');
		this.dialNowDot.setAttribute('r', '4.2');
		this.dialNowDot.setAttribute('class', 'tg-sundial-dial-now');
		svg.appendChild(this.dialNowDot);
		['00', '06', '12', '18', '24'].forEach((label, index) => {
			const point = polar(140, 126, 122, index * 45);
			const text = svgElement('text');
			text.setAttribute('x', String(point.x));
			text.setAttribute('y', String(point.y + 3));
			text.setAttribute('class', 'tg-sundial-dial-tick');
			text.textContent = label;
			svg.appendChild(text);
		});
		return svg;
	}

	private updateDial(now: Date): void {
		const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		const dayFraction = seconds / 86400;
		const hourFraction = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
		this.dialDayPath.setAttribute('d', arcPath(140, 126, 106, 0, Math.max(0.001, dayFraction * 180)));
		this.dialHourPath.setAttribute('d', arcPath(140, 126, 72, 0, Math.max(0.001, hourFraction * 180)));
		const nowPoint = polar(140, 126, 106, dayFraction * 180);
		this.dialNowDot.setAttribute('cx', String(nowPoint.x));
		this.dialNowDot.setAttribute('cy', String(nowPoint.y));
		this.clock.textContent = formatClock(now);
		const remaining = 86400 - seconds;
		this.dialSummary.textContent = `今天已过 ${Math.floor(seconds / 864)}% · 还剩 ${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`;
	}

	private renderTimerPanel(): void {
		const snapshot = this.timerController.getSnapshot();
		this.timerPanel.empty();
		this.timerElapsed = null;
		this.timerPanel.removeClass('running', 'error');
		if (snapshot.status === 'running') {
			this.timerPanel.addClass('running');
			this.renderRunning(snapshot);
		} else if (snapshot.status === 'conflict') {
			this.timerPanel.addClass('error');
			this.renderConflict(snapshot);
		} else if (snapshot.status === 'invalid') {
			this.timerPanel.addClass('error');
			this.renderInvalid(snapshot);
		} else if (snapshot.status === 'write-error') {
			this.timerPanel.addClass('error');
			this.renderWriteError(snapshot);
		} else if (snapshot.status === 'recovery-required') {
			this.renderRecovery(snapshot);
		} else {
			this.renderIdle(snapshot);
		}
		this.setBusy(this.actionBusy);
	}

	private renderIdle(snapshot: TimerSnapshot): void {
		this.createEyebrow('开始计时');
		this.createStartRow('此刻在做什么？', '开始', 'primary', true);
		if (snapshot.preparation === 'no-diary') {
			this.timerPanel.createDiv({ cls: 'tg-timer-hint', text: '无日记：开始后将创建今日日记并写入时间记录' });
		} else if (snapshot.preparation === 'no-tracker') {
			this.timerPanel.createDiv({ cls: 'tg-timer-hint', text: '无计时块：开始后写入模板标记；无标记则追加到文末' });
		}
		this.renderSuggestions();
	}

	private renderRunning(snapshot: TimerSnapshot): void {
		const entry = snapshot.runningEntries[0];
		const eyebrow = this.createEyebrow('正在计时');
		eyebrow.appendChild(this.liveDot());
		const main = this.timerPanel.createDiv('tg-timer-running-main');
		const activity = main.createDiv('tg-timer-activity');
		activity.createSpan({ cls: 'tg-timer-activity-name', text: entry.name });
		activity.createSpan({
			cls: 'tg-timer-activity-meta',
			text: `开始于 ${formatClock(new Date(entry.startTime)).slice(0, 5)} · 关闭 Obsidian 后仍继续`,
		});
		this.timerElapsed = main.createDiv({ cls: 'tg-timer-elapsed', text: formatElapsed(Date.now() - Date.parse(entry.startTime)) });
		const actions = this.timerPanel.createDiv('tg-timer-actions');
		this.createButton(actions, 'danger-quiet', '停止', () => void this.runAction(() => this.timerController.stop()), STOP_ICON);
		this.timerPanel.createDiv({ cls: 'tg-timer-switch-label', text: '切换活动 · 开始新活动会自动结束当前活动' });
		this.createStartRow('输入新的活动', '切换', 'neutral', false);
		if (this.switchMessage) this.timerPanel.createDiv({ cls: 'tg-timer-hint', text: this.switchMessage });
		this.renderSuggestions();
	}

	private renderConflict(snapshot: TimerSnapshot): void {
		this.createEyebrow('计时冲突');
		const notice = this.createNotice('发现多个活动正在运行', 'Time Grid 不会自动覆盖。结束全部后，才能开始新的活动。');
		const list = notice.createDiv('tg-timer-conflict-list');
		for (const entry of snapshot.runningEntries) {
			const row = list.createDiv('tg-timer-conflict-row');
			row.createSpan({ text: entry.name });
			row.createSpan({ cls: 'tg-timer-recovery-role', text: formatElapsed(Date.now() - Date.parse(entry.startTime)) });
		}
		const actions = this.timerPanel.createDiv('tg-timer-actions');
		this.createButton(actions, 'danger-quiet', '结束全部并继续', () => void this.runAction(() => this.timerController.resolveConflict()));
		this.createButton(actions, 'quiet', '打开今日日记', () => this.options.onOpenToday());
	}

	private renderInvalid(snapshot: TimerSnapshot): void {
		this.createEyebrow('计时不可用');
		this.createNotice(snapshot.message ?? 'simple-time-tracker 格式有误', '原文保持不变。修复后会重新读取。');
		const actions = this.timerPanel.createDiv('tg-timer-actions');
		this.createButton(actions, 'quiet', '打开今日日记', () => this.options.onOpenToday());
	}

	private renderWriteError(snapshot: TimerSnapshot): void {
		this.createEyebrow('写入失败');
		this.createNotice(snapshot.message ?? '日记在写入前发生变化', '没有覆盖新内容。可重新读取后重试。');
		const actions = this.timerPanel.createDiv('tg-timer-actions');
		this.createButton(actions, 'quiet', '重新读取并重试', () => void this.runAction(() => this.timerController.refreshNow().then(() => ({ ok: true }))));
		this.createButton(actions, 'quiet', '打开今日日记', () => this.options.onOpenToday());
	}

	private renderRecovery(snapshot: TimerSnapshot): void {
		this.createEyebrow('跨日恢复');
		const recovery = snapshot.recovery;
		if (!recovery) return;
		const notice = this.createNotice(
			`“${recovery.pointer.name}”已持续 ${formatLongDuration(recovery.durationMs)}`,
			'补齐将拆分计时并可能创建缺失日记；确认前不修改任何文件'
		);
		const list = notice.createDiv('tg-timer-recovery-list');
		recovery.affectedDates.forEach((date, index) => {
			const row = list.createDiv('tg-timer-recovery-row');
			row.createSpan({ text: displayDateKey(date) });
			row.createSpan({
				cls: 'tg-timer-recovery-role',
				text: index === 0 ? '结束于 24:00' : index === recovery.affectedDates.length - 1 ? '从 00:00 继续' : '记录 24h',
			});
		});
		const actions = this.timerPanel.createDiv('tg-timer-actions');
		this.createButton(actions, 'primary', '补齐并继续', () => void this.runAction(() => this.timerController.resolveRecovery('continue')));
		this.createButton(actions, 'neutral', '首个午夜结束', () => void this.runAction(() => this.timerController.resolveRecovery('stop-at-midnight')));
		this.createButton(actions, 'quiet', '暂不处理', () => new Notice('未修改任何日记'));
	}

	private createEyebrow(title: string): HTMLElement {
		return this.timerPanel.createDiv({ cls: 'tg-timer-eyebrow', text: title });
	}

	private createStartRow(placeholder: string, label: string, variant: ButtonVariant, withPlay: boolean): void {
		const row = this.timerPanel.createEl('form', { cls: label === '开始' ? 'tg-timer-idle-row' : 'tg-timer-switch-row' });
		const input = row.createEl('input', {
			cls: 'tg-timer-input',
			attr: { type: 'text', placeholder, 'aria-label': '活动名称', autocomplete: 'off' },
		});
		this.createButton(row, variant, label, null, withPlay ? PLAY_ICON : undefined, 'submit');
		row.addEventListener('submit', (event) => {
			event.preventDefault();
			const name = input.value.trim();
			if (!name) return void new Notice('请输入活动名称');
			void this.start(name);
		});
	}

	private renderSuggestions(): void {
		const groups: Array<[TimerSuggestionSource, string, number]> = [
			['recent', '最近', 3],
			['task', '任务', 2],
			['routine', '流程', 2],
		];
		const suggestions = this.timerController.getSuggestions();
		const wrap = this.timerPanel.createDiv('tg-chip-groups');
		let rendered = 0;
		for (const [source, label, limit] of groups) {
			const items = suggestions.filter((item) => item.source === source).slice(0, limit);
			if (items.length === 0) continue;
			rendered++;
			const group = wrap.createDiv('tg-chip-group');
			group.createSpan({ cls: 'tg-chip-group-label', text: label });
			for (const item of items) {
				const button = group.createEl('button', {
					cls: 'tg-chip',
					text: item.name,
					attr: { type: 'button', title: `开始计时：${item.name}` },
				});
				button.addEventListener('click', () => void this.start(item.name));
			}
		}
		if (rendered === 0) wrap.remove();
	}

	private async start(name: string): Promise<void> {
		const result = await this.runAction(() => this.timerController.start(name));
		if (result?.ok) {
			this.switchMessage = result.switchedFrom
				? `已在同一时刻结束“${result.switchedFrom}”，并开始“${name.trim()}”。`
				: '';
		}
	}

	private async runAction(action: () => Promise<TimerActionResult>): Promise<TimerActionResult | null> {
		if (this.actionBusy) return null;
		this.actionBusy = true;
		this.setBusy(true);
		try {
			const result = await action();
			if (!result.ok && result.reason !== 'conflict') new Notice(result.message);
			return result;
		} finally {
			this.actionBusy = false;
			this.renderTimerPanel();
		}
	}

	private setBusy(busy: boolean): void {
		this.timerPanel.toggleClass('is-busy', busy);
		this.timerPanel.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = busy; });
		this.timerPanel.querySelectorAll<HTMLInputElement>('input').forEach((input) => { input.disabled = busy; });
	}

	private createNotice(title: string, copy: string): HTMLElement {
		const card = this.timerPanel.createDiv('tg-timer-notice');
		card.createDiv({ cls: 'tg-timer-notice-title', text: title });
		card.createDiv({ cls: 'tg-timer-notice-body', text: copy });
		return card;
	}

	private createButton(
		parent: HTMLElement,
		variant: ButtonVariant,
		label: string,
		action: (() => void) | null,
		icon?: string,
		type: 'button' | 'submit' = 'button'
	): HTMLButtonElement {
		const button = parent.createEl('button', {
			cls: `tg-btn tg-btn-${variant}`,
			attr: { type },
		});
		if (icon) {
			const iconWrap = button.createSpan('tg-btn-icon');
			iconWrap.setAttr('aria-hidden', 'true');
			iconWrap.innerHTML = icon;
		}
		button.appendText(label);
		if (action) button.addEventListener('click', action);
		return button;
	}

	private liveDot(): HTMLElement {
		const dot = document.createElement('span');
		dot.className = 'tg-timer-live-dot';
		return dot;
	}

	private updateTimerElapsed(now: Date): void {
		const entry = this.timerController.getSnapshot().runningEntries[0];
		if (this.timerElapsed && entry) this.timerElapsed.textContent = formatElapsed(now.getTime() - Date.parse(entry.startTime));
	}

	private async refreshActivity(now: Date, force: boolean): Promise<void> {
		const file = getDailyNoteFileForDate(this.app, now);
		let content: string | null = null;
		if (file) {
			if (force || !this.activityCache || this.activityCache.path !== file.path || this.activityCache.mtime !== file.stat.mtime) {
				content = await this.app.vault.cachedRead(file);
				this.activityCache = { path: file.path, mtime: file.stat.mtime, content };
			} else content = this.activityCache.content;
		}
		this.renderActivity(now, file, content);
	}

	private renderActivity(now: Date, file: TFile | null, content: string | null): void {
		this.activityBlock.empty();
		let statusText = '';
		let buckets: DurationBucket[] = [];
		if (!file) statusText = '今日还没有日记 · 开始计时后自动创建';
		else {
			const parsed = parseSimpleTimeTracker(content ?? '');
			if (parsed.status === 'missing') statusText = '今日日记暂无计时记录';
			else if (parsed.status === 'invalid') statusText = 'simple-time-tracker 格式有误';
			else buckets = aggregateDurations(parsed.data, now, startOfDay(now), endOfDay(now));
		}
		const total = buckets.reduce((sum, bucket) => sum + bucket.durationMs, 0);
		const header = this.activityBlock.createDiv('tg-sundial-section-head');
		header.createDiv({ cls: 'tg-sundial-section-label', text: '今日去向' });
		header.createDiv({ cls: 'tg-sundial-section-meta', text: total > 0 ? `累计 ${formatDuration(total, false)}` : '待记录' });
		if (buckets.length === 0) {
			this.activityBlock.createDiv({ cls: 'tg-sundial-activity-empty', text: statusText || '计时块中暂无有效记录' });
			return;
		}
		const display = displayBuckets(buckets);
		const bar = this.activityBlock.createDiv('tg-sundial-activity-bar');
		for (const bucket of display) {
			const segment = bar.createDiv(`tg-sundial-activity-segment tg-sundial-viz-${bucket.colorIndex}`);
			segment.setAttr('style', `width:${(bucket.durationMs / total * 100).toFixed(2)}%`);
			segment.setAttr('title', `${bucket.name} · ${formatDuration(bucket.durationMs, bucket.isRunning)}`);
		}
		const list = this.activityBlock.createDiv('tg-sundial-activity-list');
		for (const bucket of display) {
			const row = list.createDiv('tg-sundial-activity-row');
			row.createSpan(`tg-sundial-activity-swatch tg-sundial-viz-${bucket.colorIndex}`);
			const name = row.createDiv({ cls: 'tg-sundial-activity-name', text: bucket.name });
			if (bucket.isRunning) name.appendChild(this.liveDot());
			row.createDiv({ cls: 'tg-sundial-activity-value', text: `${formatDuration(bucket.durationMs, bucket.isRunning)} · ${Math.round(bucket.durationMs / total * 100)}%` });
		}
		const runningCount = buckets.filter((bucket) => bucket.isRunning).length;
		const status = this.activityBlock.createDiv('tg-sundial-activity-status');
		if (runningCount > 0) status.appendChild(this.liveDot());
		status.appendText(runningCount > 0 ? `${runningCount} 段进行中 · 实时更新` : `共 ${buckets.length} 段计时`);
	}

	private showTooltip(event: MouseEvent, day: HeatDay): void {
		this.tooltip.empty();
		this.tooltip.createEl('strong', { text: day.dateKey });
		this.tooltip.createDiv({ text: formatHeatValue(day.durationMs, day.wordCount) });
		this.tooltip.show();
		this.moveTooltip(event);
	}

	private moveTooltip(event: MouseEvent): void {
		this.tooltip.setAttr('style', `left:${event.clientX + 12}px;top:${event.clientY + 12}px`);
	}
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
	return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function dialPath(className: string, radius: number, width: number): SVGPathElement {
	const path = svgElement('path');
	path.setAttribute('d', arcPath(140, 126, radius, 0, 180));
	path.setAttribute('class', className);
	path.setAttribute('stroke-width', String(width));
	return path;
}

function polar(cx: number, cy: number, radius: number, degree: number): { x: number; y: number } {
	const angle = (degree - 180) * Math.PI / 180;
	return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
	const from = polar(cx, cy, radius, start);
	const to = polar(cx, cy, radius, end);
	return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;
}

function heatDates(now: Date, weeks: number): Date[] {
	const today = startOfDay(now);
	const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
	const firstMonday = new Date(today);
	firstMonday.setDate(today.getDate() - dayIndex - (weeks - 1) * 7);
	const dates: Date[] = [];
	for (let index = 0; index < weeks * 7; index++) {
		const date = new Date(firstMonday);
		date.setDate(firstMonday.getDate() + index);
		dates.push(date);
	}
	return dates;
}

function heatLevel(value: number, max: number): number {
	if (value <= 0 || max <= 0) return 0;
	return Math.max(1, Math.min(4, Math.ceil(value / max * 4)));
}

function displayBuckets(buckets: DurationBucket[]): DisplayBucket[] {
	const sorted = [...buckets].sort((a, b) => b.durationMs - a.durationMs);
	const visible: DisplayBucket[] = sorted.slice(0, MAX_ACTIVITY_ROWS).map((bucket) => ({
		...bucket,
		key: bucket.name,
		colorIndex: colorIndex(bucket.name),
	}));
	const rest = sorted.slice(MAX_ACTIVITY_ROWS);
	if (rest.length > 0) {
		visible.push({
			key: '__other',
			name: '其他',
			durationMs: rest.reduce((sum, bucket) => sum + bucket.durationMs, 0),
			isRunning: rest.some((bucket) => bucket.isRunning),
			colorIndex: 5,
		});
	}
	return visible;
}

function colorIndex(name: string): number {
	let hash = 0;
	for (let index = 0; index < name.length; index++) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
	return hash % 6;
}

function formatClock(date: Date): string {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatElapsed(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds % 3600 / 60))}:${pad(seconds % 60)}`;
}

function formatDuration(ms: number, includeSeconds: boolean): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor(seconds % 3600 / 60);
	const remain = seconds % 60;
	if (includeSeconds) return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(remain)}s` : `${minutes}m ${pad(remain)}s`;
	return hours > 0 ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}` : `${minutes}m`;
}

function formatLongDuration(ms: number): string {
	const days = Math.floor(ms / DAY_MS);
	const hours = Math.floor(ms % DAY_MS / 3600000);
	return `${days > 0 ? `${days}天 ` : ''}${hours}h`;
}

function formatHeatValue(durationMs: number, wordCount: number): string {
	return `记录 ${formatDuration(durationMs, false)} · 净增 ${Math.round(wordCount).toLocaleString()}字`;
}

function displayDateKey(value: string): string {
	const [, month, day] = value.split('-').map(Number);
	return `${month}月${day}日`;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function sameDate(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
