export type TimerPanelState = 'idle' | 'running' | 'conflict' | 'invalid' | 'writeError' | 'recovery';
export interface RecoveryDay { label: string; role: string; }
export interface ConflictItem { name: string; duration: string; }
export interface SuggestionSet {
  recent?: string[];
  tasks?: string[];
  routines?: string[];
  onPick?: (name: string) => void;
}
export interface TimerPanelProps {
  state?: TimerPanelState;
  /** Idle-only sub-hint: 'none' shows nothing, 'no-diary'/'no-tracker' show the matching one-line caption. */
  idleHint?: 'none' | 'no-diary' | 'no-tracker';
  inputValue?: string;
  onInputChange?: (v: string) => void;
  onStart?: () => void;
  /** Running: current activity name (truncates), start time as "HH:MM", live elapsed as "HH:MM:SS". */
  activityName?: string;
  startedAt?: string;
  elapsed?: string;
  onStop?: () => void;
  switchValue?: string;
  onSwitchChange?: (v: string) => void;
  onSwitchSubmit?: () => void;
  /** Set right after a successful switch to show the one-line confirmation; clear on next interaction. */
  justSwitched?: { from: string; to: string } | null;
  /** Conflict: every currently-running activity with its elapsed duration. */
  conflictItems?: ConflictItem[];
  onEndAll?: () => void;
  onOpenDiary?: () => void;
  /** Invalid: exact machine-readable reason, e.g. "simple-time-tracker 格式有误" / "发现多个计时块". */
  invalidReason?: string;
  /** WriteError: exact reason, e.g. "日记在写入前发生变化" / "写入时发生 IO 错误". */
  writeErrorReason?: string;
  onRetry?: () => void;
  /** Recovery: activity that ran >24h, its duration string, and one row per affected date. */
  recoveryActivity?: string;
  recoveryDuration?: string;
  recoveryDays?: RecoveryDay[];
  onBackfill?: () => void;
  onEndFirstMidnight?: () => void;
  onDismissRecovery?: () => void;
  /** Recent/task/routine quick-start chips — shown under Idle and Running only. */
  suggestions?: SuggestionSet;
  className?: string;
}
/** The one timer entry point in Time Grid: start / stop / atomic switch only — no pause, no history edit, no parallel timers. Lives directly beneath the now-dial in Scheme Three. */
export function TimerPanel(props: TimerPanelProps): JSX.Element;
