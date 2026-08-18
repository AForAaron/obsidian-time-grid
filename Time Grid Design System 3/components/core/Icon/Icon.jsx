import React from 'react';

const PATHS = {
  month: 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4zm6 0h4v4h-4v-4zM7 16h4v4H7v-4zm6 0h4v4h-4v-4z',
  day: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zm0-2a10 10 0 1 1 0 20a10 10 0 0 1 0-20zm1 5h-2v6l5 3l1-1.732-4-2.268V7z',
  hour: 'M9 2h6v2H9V2zm3 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm1 2h-2v4.5l3.5 2.1l1-1.7-2.5-1.4V9z',
  pie: 'M11 2v9H2a10 10 0 0 1 9-9zm2 0a10 10 0 1 1-4.9 18.7L13 11V2z',
  chevronLeft: 'M15.4 5.6L14 4.2L6.2 12l7.8 7.8l1.4-1.4L9 12l6.4-6.4z',
  chevronRight: 'M8.6 18.4L10 19.8l7.8-7.8L10 4.2L8.6 5.6L15 12l-6.4 6.4z',
};

export function Icon(props) {
  const { name, size = 16 } = props;
  const d = PATHS[name];
  if (!d) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    </span>
  );
}
