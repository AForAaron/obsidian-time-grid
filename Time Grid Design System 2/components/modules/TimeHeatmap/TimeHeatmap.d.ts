export interface TimeHeatmapProps {
  /** Reference date; defaults to now. Drives which day is "today". */
  now?: Date;
  /** Number of weeks (columns) to render. Default 24. */
  weeks?: number;
}
export function TimeHeatmap(props: TimeHeatmapProps): JSX.Element;
