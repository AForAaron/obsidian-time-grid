import React from 'react';
import { Icon } from '../../core/Icon/Icon.jsx';

export function HourGrid(props) {
  const { now = new Date() } = props;
  const currentMinute = now.getMinutes();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return (
    <div className="tg-module">
      <div className="tg-module-header">
        <span className="tg-module-title">当下 (60m)</span>
        <span className="tg-time-display">{timeStr}</span>
        <Icon name="hour" size={16} />
      </div>
      <div className="tg-hour-grid">
        {Array.from({ length: 60 }, (_, minute) => {
          const state = minute < currentMinute ? 'past' : minute === currentMinute ? 'current' : 'future';
          return <div key={minute} className={`tg-minute-cell ${state}`} />;
        })}
      </div>
    </div>
  );
}
