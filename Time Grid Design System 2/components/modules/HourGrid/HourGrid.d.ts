export interface HourGridProps {
  /** Reference time; defaults to now. Determines which minute cell is "current" and the live clock text. */
  now?: Date;
}
export function HourGrid(props: HourGridProps): JSX.Element;
