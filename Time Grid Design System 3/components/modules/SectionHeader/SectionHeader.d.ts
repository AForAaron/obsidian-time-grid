export interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  count: number;
  /** When set and different from count, renders "matchCount / count" (active search/filter). */
  matchCount?: number;
  /** Overdue/Today are always expanded and show no chevron. */
  fixed?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** CSS var name for the icon chip's tint, e.g. "--tg-status-longterm". */
  accentColor?: string;
}
export function SectionHeader(props: SectionHeaderProps): JSX.Element;
