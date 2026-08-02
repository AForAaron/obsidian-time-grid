import React from 'react';
import { Icon } from '../../core/Icon/Icon.jsx';

export function DayGrid(props) {
  const { now = new Date() } = props;
  const currentHour = now.getHours();
  return (
    <div className="tg-module">
      <div className="tg-module-header">
        <span className="tg-module-title">今日 (24h)</span>
        <Icon name="day" size={16} />
      </div>
      <div className="tg-day-grid">
        {Array.from({ length: 24 }, (_, hour) => {
          const state = hour < currentHour ? 'past' : hour === currentHour ? 'current' : 'future';
          return <div key={hour} className={`tg-hour-cell ${state}`}>{hour}</div>;
        })}
      </div>
    </div>
  );
}
