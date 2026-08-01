import React from 'react';

export function StatCard(props) {
  const { icon, value, label, accentColor } = props;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-panel)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accentColor ? `color-mix(in srgb, var(${accentColor}) 16%, transparent)` : 'var(--surface-hover)',
        color: accentColor ? `var(${accentColor})` : 'var(--text-muted)', fontSize: 14,
      }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}
