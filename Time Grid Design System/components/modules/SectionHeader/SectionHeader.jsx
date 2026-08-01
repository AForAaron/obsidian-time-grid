import React from 'react';

export function SectionHeader(props) {
  const {
    icon, title, subtitle, count, matchCount, fixed = false, collapsed = false, onToggle, accentColor,
  } = props;
  const showRatio = matchCount !== undefined && matchCount !== count;
  return (
    <button
      onClick={fixed ? undefined : onToggle}
      aria-expanded={fixed ? undefined : !collapsed}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-panel)',
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
        cursor: fixed ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', textAlign: 'left',
      }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accentColor ? `color-mix(in srgb, var(${accentColor}) 16%, transparent)` : 'var(--surface-hover)',
        color: accentColor ? `var(${accentColor})` : 'var(--text-muted)', fontSize: 13,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{subtitle}</span>}
      </div>
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        background: 'var(--surface-hover)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', flex: '0 0 auto',
      }}>{showRatio ? `${matchCount} / ${count}` : count}</span>
      {!fixed && <span style={{ color: 'var(--text-faint)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s ease' }}>⌄</span>}
    </button>
  );
}
