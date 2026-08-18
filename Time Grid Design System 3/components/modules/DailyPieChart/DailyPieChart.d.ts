export interface DailyPieBucket {
  name: string;
  durationMs: number;
  isRunning?: boolean;
}
export interface DailyPieChartProps {
  /** Named time buckets for today; unfilled 24h remainder renders as "未记录". Ships with demo data when omitted. */
  buckets?: DailyPieBucket[];
}
export function DailyPieChart(props: DailyPieChartProps): JSX.Element;
