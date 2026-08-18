export interface DayGridProps {
  /** Reference time; defaults to now. Determines which of the 24 hour cells is "current". */
  now?: Date;
}
export function DayGrid(props: DayGridProps): JSX.Element;
