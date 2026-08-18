import React from 'react';

const STATUS_LABEL = { todo: '待办', doing: '进行中', done: '完成', cancelled: '取消', unknown: '未知状态' };
const STATUS_COLOR_VAR = { todo: '--text-muted', doing: '--tg-status-today', done: '--tg-status-done', cancelled: '--tg-status-cancelled', unknown: '--tg-status-readonly' };

export function TaskCard(props) {
  const {
    title, status = 'todo', accentColor, dueDate, overdue = false, priority,
    readonly = false, readonlyReason, sourceFile, writing = false,
    onToggle, onMore, onTitleClick, onEdit, onPostpone,
  } = props;
  const checked = status === 'done' || status === 'cancelled';
  const canCheck = !readonly && status !== 'unknown';
  const statusVar = STATUS_COLOR_VAR[status] || '--text-muted';

  return (
    <div className="tg-task-card" style={{
      position: 'relative', background: 'var(--surface-panel)', border: '1px solid var(--border-default)',
      borderLeft: `3px solid ${accentColor ? `var(${accentColor})` : 'var(--border-default)'}`,
      borderStyle: readonly ? 'dashed' : 'solid', borderRadius: 'var(--radius-md)',
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
      opacity: writing ? 0.6 : 1, fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <button aria-label={checked ? '重新打开为待办' : '标记为完成'} disabled={!canCheck} onClick={onToggle}
          style={{
            width: 18, height: 18, marginTop: 2, flex: '0 0 auto', borderRadius: 4, cursor: canCheck ? 'pointer' : 'default',
            border: `1.5px solid ${checked ? 'var(--tg-status-done)' : 'var(--border-default)'}`,
            background: status === 'done' ? 'var(--tg-status-done)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}>
          {status === 'done' && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
          {status === 'cancelled' && <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--text-faint)" strokeWidth="3"><path d="M6 6l12 12M18 6L6 18" /></svg>}
        </button>
        <span onClick={onTitleClick} tabIndex={0} style={{
          flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-primary)', cursor: onTitleClick ? 'pointer' : 'default',
          textDecoration: status === 'done' ? 'line-through' : 'none', opacity: status === 'done' ? 0.65 : 1,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3,
        }}>{title}</span>
        <button aria-label="更多操作" aria-haspopup="menu" onClick={onMore} style={{
          flex: '0 0 auto', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-default)',
          background: 'var(--surface-panel)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>⋯</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 26 }}>
        {dueDate && <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: overdue ? 'var(--tg-status-overdue)' : 'var(--text-muted)' }}>{dueDate}</span>}
        <span style={{
          fontSize: 'var(--text-2xs)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', border: `1px solid var(${statusVar})`,
          color: `var(${statusVar})`,
        }}>{STATUS_LABEL[status]}</span>
        {priority && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{priority}</span>}
        {readonly && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--tg-status-readonly)' }}>{readonlyReason || '只读'}</span>}
      </div>
      {sourceFile && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', paddingLeft: 26, fontFamily: 'var(--font-mono)' }}>{sourceFile}</div>}
      {!readonly && (onEdit || onPostpone) && (
        <div className="tg-task-hover-actions" style={{
          position: 'absolute', top: 8, right: 40, display: 'flex', gap: 4, opacity: 0, transition: 'opacity .12s ease',
        }}>
          {onEdit && <button aria-label="编辑任务" onClick={onEdit} style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--surface-panel)', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</button>}
          {onPostpone && <button aria-label="顺延一天" onClick={onPostpone} style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--surface-panel)', color: 'var(--text-muted)', cursor: 'pointer' }}>»</button>}
        </div>
      )}
      <style>{`.tg-task-card:hover .tg-task-hover-actions{opacity:1}`}</style>
    </div>
  );
}
