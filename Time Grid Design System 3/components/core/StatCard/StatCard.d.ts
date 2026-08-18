export interface StatCardProps {
  /** Single glyph or short symbol, e.g. from the Icon set or a plain character. */
  icon?: React.ReactNode;
  value: number | string;
  label: string;
  /** CSS var name for the icon chip's tint, e.g. "--tg-status-overdue". */
  accentColor?: string;
}
export function StatCard(props: StatCardProps): JSX.Element;
