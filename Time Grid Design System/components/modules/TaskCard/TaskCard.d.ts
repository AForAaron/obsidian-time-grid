export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled' | 'unknown';

export interface TaskCardProps {
  title: string;
  /** Editable/unknown status shown in the status badge. */
  status?: TaskStatus;
  /** CSS var name (e.g. "--tg-status-overdue") for the left accent border — reflects which section the task belongs to. */
  accentColor?: string;
  /** Pre-formatted due date string. */
  dueDate?: string;
  /** Colors the due date red when true. */
  overdue?: boolean;
  /** Pre-formatted priority label. */
  priority?: string;
  /** Recurring / malformed / unknown-status tasks: disables checkbox + hover actions, shows a dashed border. */
  readonly?: boolean;
  /** Short human reason shown next to the readonly chip, e.g. "循环 · 只读". */
  readonlyReason?: string;
  /** Source file path, shown only when passed (card never shows it by default). */
  sourceFile?: string;
  /** Dims the card and disables actions while a write is in flight. */
  writing?: boolean;
  onToggle?: () => void;
  onMore?: () => void;
  onStatus?: () => void;
  onTitleClick?: () => void;
  onEdit?: () => void;
  onPostpone?: () => void;
}
export function TaskCard(props: TaskCardProps): JSX.Element;
