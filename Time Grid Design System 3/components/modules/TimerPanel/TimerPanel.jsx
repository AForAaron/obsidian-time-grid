import React from 'react';
import { Button } from '../../core/Button/Button.jsx';
import { SuggestionChips } from '../SuggestionChips/SuggestionChips.jsx';

function PlayIcon() {
  return <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 4l14 8-14 8z" /></svg>;
}
function StopIcon() {
  return <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>;
}

export function TimerPanel(props) {
  const {
    state = 'idle',
    idleHint = 'none',
    inputValue = '', onInputChange, onStart,
    activityName = '', startedAt = '', elapsed = '00:00:00', onStop,
    switchValue = '', onSwitchChange, onSwitchSubmit,
    justSwitched,
    conflictItems = [], onEndAll, onOpenDiary,
    invalidReason = 'simple-time-tracker 格式有误',
    writeErrorReason = '日记在写入前发生变化',
    onRetry,
    recoveryActivity = '', recoveryDuration = '', recoveryDays = [],
    onBackfill, onEndFirstMidnight, onDismissRecovery,
    suggestions,
    className = '',
  } = props;

  const isNotice = state === 'conflict' || state === 'invalid' || state === 'writeError';
  const panelClass = ['tg-timer-panel', state === 'running' ? 'running' : '', isNotice ? 'error' : '', className].filter(Boolean).join(' ');

  return (
    <div className={panelClass}>
      {state === 'idle' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">开始计时</div>
          <div className="tg-timer-idle-row">
            <input className="tg-timer-input" placeholder="此刻在做什么？" value={inputValue} onChange={(e) => onInputChange && onInputChange(e.target.value)} />
            <Button variant="primary" icon={<PlayIcon />} onClick={onStart}>开始</Button>
          </div>
          {idleHint === 'no-diary' && <div className="tg-timer-hint">无日记：开始后将创建今日日记并写入时间记录</div>}
          {idleHint === 'no-tracker' && <div className="tg-timer-hint">无计时块：开始后写入模板标记；无标记则追加到文末</div>}
          <SuggestionChips {...suggestions} />
        </React.Fragment>
      )}

      {state === 'running' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">正在计时<span className="tg-timer-live-dot" /></div>
          <div className="tg-timer-running-main">
            <div className="tg-timer-activity">
              <span className="tg-timer-activity-name">{activityName}</span>
              <span className="tg-timer-activity-meta">开始于 {startedAt} · 关闭 Obsidian 后仍继续</span>
            </div>
            <div className="tg-timer-elapsed">{elapsed}</div>
          </div>
          <div className="tg-timer-actions">
            <Button variant="danger-quiet" icon={<StopIcon />} onClick={onStop}>停止</Button>
          </div>
          <div className="tg-timer-switch-label">切换活动 · 开始新活动会自动结束当前活动</div>
          <div className="tg-timer-switch-row">
            <input className="tg-timer-input" placeholder="输入新的活动" value={switchValue} onChange={(e) => onSwitchChange && onSwitchChange(e.target.value)} />
            <Button variant="neutral" onClick={onSwitchSubmit}>切换</Button>
          </div>
          {justSwitched && <div className="tg-timer-hint">已在同一时刻结束"{justSwitched.from}"，并开始"{justSwitched.to}"。</div>}
          <SuggestionChips {...suggestions} />
        </React.Fragment>
      )}

      {state === 'conflict' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">计时冲突</div>
          <div className="tg-timer-notice">
            <div className="tg-timer-notice-title">发现多个活动正在运行</div>
            <div className="tg-timer-notice-body">Time Grid 不会自动覆盖。结束全部后，才能开始新的活动。</div>
            <div className="tg-timer-conflict-list">
              {conflictItems.map((it, i) => (
                <div className="tg-timer-conflict-row" key={i}><span>{it.name}</span><span className="tg-timer-recovery-role">{it.duration}</span></div>
              ))}
            </div>
          </div>
          <div className="tg-timer-actions">
            <Button variant="danger-quiet" onClick={onEndAll}>结束全部并继续</Button>
            <Button variant="quiet" onClick={onOpenDiary}>打开今日日记</Button>
          </div>
        </React.Fragment>
      )}

      {state === 'invalid' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">计时不可用</div>
          <div className="tg-timer-notice">
            <div className="tg-timer-notice-title">{invalidReason}</div>
            <div className="tg-timer-notice-body">原文保持不变。修复后会重新读取。</div>
          </div>
          <div className="tg-timer-actions">
            <Button variant="quiet" onClick={onOpenDiary}>打开今日日记</Button>
          </div>
        </React.Fragment>
      )}

      {state === 'writeError' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">写入失败</div>
          <div className="tg-timer-notice">
            <div className="tg-timer-notice-title">{writeErrorReason}</div>
            <div className="tg-timer-notice-body">没有覆盖新内容。可重新读取后重试。</div>
          </div>
          <div className="tg-timer-actions">
            <Button variant="quiet" onClick={onRetry}>重新读取并重试</Button>
            <Button variant="quiet" onClick={onOpenDiary}>打开今日日记</Button>
          </div>
        </React.Fragment>
      )}

      {state === 'recovery' && (
        <React.Fragment>
          <div className="tg-timer-eyebrow">跨日恢复</div>
          <div className="tg-timer-notice">
            <div className="tg-timer-notice-title">"{recoveryActivity}"已持续 {recoveryDuration}</div>
            <div className="tg-timer-notice-body">补齐将拆分计时并可能创建缺失日记；确认前不修改任何文件</div>
            <div className="tg-timer-recovery-list">
              {recoveryDays.map((d, i) => (
                <div className="tg-timer-recovery-row" key={i}><span>{d.label}</span><span className="tg-timer-recovery-role">{d.role}</span></div>
              ))}
            </div>
          </div>
          <div className="tg-timer-actions">
            <Button variant="primary" onClick={onBackfill}>补齐并继续</Button>
            <Button variant="neutral" onClick={onEndFirstMidnight}>首个午夜结束</Button>
            <Button variant="quiet" onClick={onDismissRecovery}>暂不处理</Button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
