import React from 'react';
import { Icon } from '../../core/Icon/Icon.jsx';

function pad(n) { return String(n).padStart(2, '0'); }

function seededLevel(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  const r = h % 100;
  if (r < 30) return 0;
  if (r < 55) return 1;
  if (r < 75) return 2;
  if (r < 90) return 3;
  return 4;
}

function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const idx = r.getDay() === 0 ? 6 : r.getDay() - 1;
  r.setDate(r.getDate() - idx);
  return r;
}

export function TimeHeatmap(props) {
  const { now = new Date(), weeks: weeksToShow = 24 } = props;
  const weekStart = startOfWeek(now);
  const columns = [];
  const monthLabels = [];
  let lastMonth = -1;
  let activeDays = 0, totalHours = 0;
  for (let w = 0; w < weeksToShow; w++) {
    const col = [];
    const colStart = new Date(weekStart);
    colStart.setDate(weekStart.getDate() + (w - (weeksToShow - 1)) * 7);
    if (colStart.getMonth() !== lastMonth && colStart.getDate() <= 7) {
      monthLabels.push({ w, label: `${colStart.getMonth() + 1}月` });
      lastMonth = colStart.getMonth();
    }
    for (let d = 0; d < 7; d++) {
      const date = new Date(colStart);
      date.setDate(colStart.getDate() + d);
      const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const isToday = date.toDateString() === now.toDateString();
      const isFuture = date > now;
      const level = isFuture ? 0 : seededLevel(dateKey);
      if (level > 0) { activeDays++; totalHours += level * 0.6; }
      col.push({ dateKey, level, isToday, isFuture });
    }
    columns.push(col);
  }
  return (
    <div className="tg-module tg-heatmap">
      <div className="tg-module-header">
        <div className="tg-module-heading">
          <span className="tg-module-title">活动热力图</span>
          <span className="tg-heatmap-summary">近{weeksToShow}周 · 计时 {activeDays}天 / {totalHours.toFixed(1)}h</span>
        </div>
        <div className="tg-heatmap-actions">
          <button className="tg-nav-btn"><Icon name="chevronLeft" size={14} /></button>
          <button className="tg-nav-btn"><Icon name="chevronRight" size={14} /></button>
          <Icon name="month" size={18} />
        </div>
      </div>
      <div className="tg-heatmap-body">
        <div className="tg-heatmap-weekdays">
          {['一', '', '三', '', '五', '', '日'].map((l, i) => <div key={i} className="tg-heatmap-weekday">{l}</div>)}
        </div>
        <div className="tg-heatmap-content">
          <div className="tg-heatmap-month-labels" style={{ gridTemplateColumns: `repeat(${weeksToShow}, var(--tg-heatmap-cell-size))` }}>
            {monthLabels.map((m) => <div key={m.w} className="tg-heatmap-month-label" style={{ gridColumn: m.w + 1 }}>{m.label}</div>)}
          </div>
          <div className="tg-heatmap-week-grid">
            {columns.map((col, w) => (
              <div className="tg-heatmap-week-col" key={w}>
                {col.map((cell, d) => (
                  <div key={d} title={cell.dateKey} className={`tg-heatmap-cell level-${cell.level}${cell.isToday ? ' today' : ''}${cell.isFuture ? ' future' : ''}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="tg-heatmap-legend">
        <span className="tg-heatmap-legend-label">少</span>
        <div className="tg-heatmap-legend-bar">
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`tg-heatmap-legend-seg level-${l}`} />)}
        </div>
        <span className="tg-heatmap-legend-label">多</span>
      </div>
    </div>
  );
}
