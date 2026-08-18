import React from 'react';
import { Icon } from '../../core/Icon/Icon.jsx';

const RADIUS = 58;
const CIRC = 2 * Math.PI * RADIUS;
const DAY_MS = 24 * 60 * 60 * 1000;
const COLOR_CLASSES = ['tg-pie-slice-0', 'tg-pie-slice-1', 'tg-pie-slice-2', 'tg-pie-slice-3', 'tg-pie-slice-4', 'tg-pie-slice-5', 'tg-pie-slice-6', 'tg-pie-slice-7'];

function formatDuration(ms, includeSeconds) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (includeSeconds) return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatPercent(v) { return v >= 10 || v === 0 ? `${Math.round(v)}%` : `${Math.round(v * 10) / 10}%`; }
function colorClass(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLOR_CLASSES[h % COLOR_CLASSES.length];
}

export function DailyPieChart(props) {
  const { buckets = [
    { name: '写作', durationMs: 2.5 * 3600000, isRunning: false },
    { name: '阅读', durationMs: 1.1 * 3600000, isRunning: false },
    { name: '会议', durationMs: 0.8 * 3600000, isRunning: true },
    { name: '锻炼', durationMs: 0.5 * 3600000, isRunning: false },
  ] } = props;
  const [hoverKey, setHoverKey] = React.useState(null);
  const hasData = buckets.length > 0;
  const total = buckets.reduce((s, b) => s + b.durationMs, 0);
  const remainder = Math.max(0, DAY_MS - total);
  const runningCount = buckets.filter((b) => b.isRunning).length;
  const display = buckets.map((b) => ({ ...b, key: b.name, colorClass: colorClass(b.name) }));

  let offset = 0;
  const segments = display.map((b) => {
    const raw = (b.durationMs / DAY_MS) * CIRC;
    const gap = display.length > 1 ? 2.5 : 0;
    const len = Math.max(0.75, Math.min(CIRC, raw - gap));
    const seg = { ...b, len, offset };
    offset += raw;
    return seg;
  });
  const rows = [...display, ...(remainder > 0 ? [{ key: '__unrecorded', name: '未记录', durationMs: remainder, colorClass: 'tg-pie-slice-muted' }] : [])];

  return (
    <div className="tg-module">
      <div className="tg-module-header">
        <span className="tg-module-title">今日计时分布</span>
        <Icon name="pie" size={16} />
      </div>
      <div className="tg-pie-body">
        <div className="tg-pie-chart">
          <svg viewBox="0 0 144 144" width={140} height={140}>
            <circle cx="72" cy="72" r={RADIUS} fill="none" className={hasData ? 'tg-pie-ring-track' : 'tg-pie-ring-empty'} stroke="var(--tg-pie-track,var(--border-subtle))" strokeWidth="14" strokeDasharray={hasData ? undefined : '1.5 7.5'} strokeLinecap={hasData ? 'butt' : 'round'} />
            <g transform="rotate(-90 72 72)">
              {segments.map((seg) => (
                <circle key={seg.key} cx="72" cy="72" r={RADIUS} fill="none" strokeWidth={hoverKey === seg.key ? 17 : 14}
                  style={{ opacity: hoverKey && hoverKey !== seg.key ? 0.3 : 1, transition: 'opacity .18s ease,stroke-width .18s ease', cursor: 'pointer' }}
                  className={seg.colorClass} stroke={`var(--tg-viz-${(COLOR_CLASSES.indexOf(seg.colorClass) % 8) + 1})`}
                  strokeDasharray={`${seg.len.toFixed(2)} ${(CIRC - seg.len).toFixed(2)}`} strokeDashoffset={(-seg.offset).toFixed(2)}
                  onMouseEnter={() => setHoverKey(seg.key)} onMouseLeave={() => setHoverKey(null)} />
              ))}
            </g>
          </svg>
          <div className="tg-pie-center">
            <div className="tg-pie-center-value">{formatDuration(total, runningCount > 0)}</div>
            <div className="tg-pie-center-label">{hasData ? '已记录' : '今日暂无记录'}</div>
          </div>
        </div>
        <div className="tg-pie-legend">
          {rows.map((b) => (
            <div key={b.key} className={`tg-pie-legend-row${hoverKey === b.key ? ' active' : ''}${hoverKey && hoverKey !== b.key ? ' dimmed' : ''}`}
              onMouseEnter={() => setHoverKey(b.key)} onMouseLeave={() => setHoverKey(null)}>
              <span className={`tg-pie-legend-swatch ${b.colorClass}`} />
              <div className="tg-pie-legend-label">
                <span className="tg-pie-legend-name">{b.name}</span>
                {b.isRunning && <span className="tg-pie-running-badge"><span className="tg-pie-dot" />进行中</span>}
              </div>
              <div className="tg-pie-legend-value">{formatDuration(b.durationMs)}</div>
              <div className="tg-pie-legend-percent">{formatPercent((b.durationMs / DAY_MS) * 100)}</div>
              <div className="tg-pie-legend-bar"><div className={`tg-pie-legend-bar-fill ${b.colorClass}`} style={{ width: `${Math.min(100, (b.durationMs / DAY_MS) * 100).toFixed(1)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="tg-pie-status">
          {runningCount > 0 && <span className="tg-pie-dot" />}
          <span>{runningCount > 0 ? `${runningCount} 段进行中 · 实时更新` : `共 ${buckets.length} 段计时`}</span>
        </div>
      </div>
    </div>
  );
}
