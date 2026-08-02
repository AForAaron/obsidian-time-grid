import React from 'react';
import { Icon } from '../../core/Icon/Icon.jsx';

export function MonthHeatmap(props) {
  const { now = new Date() } = props;
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({ empty: true, key: `e${i}` });
  for (let day = 1; day <= daysInMonth; day++) {
    const state = day < today ? 'past' : day === today ? 'current' : 'future';
    cells.push({ day, state, key: day });
  }
  return (
    <div className="tg-module">
      <div className="tg-module-header">
        <span className="tg-module-title">本月</span>
        <Icon name="month" size={16} />
      </div>
      <div className="tg-month-grid">
        {['一', '二', '三', '四', '五', '六', '日'].map((l) => <div key={l} className="tg-week-label">{l}</div>)}
        {cells.map((c) => c.empty
          ? <div key={c.key} className="tg-month-day empty" />
          : <div key={c.key} className={`tg-month-day ${c.state}`}>{c.day}</div>
        )}
      </div>
    </div>
  );
}
