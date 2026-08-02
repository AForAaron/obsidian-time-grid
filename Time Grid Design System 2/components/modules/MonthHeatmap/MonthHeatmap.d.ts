export interface MonthHeatmapProps {
  /** Reference date; defaults to now. Determines the visible month and past/current/future coloring. */
  now?: Date;
}
export function MonthHeatmap(props: MonthHeatmapProps): JSX.Element;
