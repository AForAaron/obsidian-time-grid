export interface SuggestionChipsProps {
  /** Activity names used in the last 7 days, most-recent first. Truncated to 3. */
  recent?: string[];
  /** Today's / overdue task display names. Truncated to 2. */
  tasks?: string[];
  /** Today's incomplete daily-routine item names. Truncated to 2. */
  routines?: string[];
  onPick?: (name: string) => void;
}
/** Renders null (no placeholder) when all three groups are empty. Must sit inside a `.tg-timer-panel` (or another `container-name:tgtimer` ancestor) to get its narrow-width stacked layout. */
export function SuggestionChips(props: SuggestionChipsProps): JSX.Element | null;
