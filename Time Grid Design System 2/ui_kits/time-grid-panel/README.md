# Time Grid Panel — UI Kit

Recreation of the Time Grid Obsidian plugin's right-sidebar view (`src/views/TimeGridView.ts`), assembled from this design system's five module components in the same order as the real plugin:

1. `TimeHeatmap` — 24-week activity heatmap
2. `MonthHeatmap` — current-month calendar
3. `DayGrid` — 24-hour grid
4. `HourGrid` — 60-minute grid + live clock
5. `DailyPieChart` — today's time-tracker ring

`index.html` ticks a live `now` every second (matching the plugin's 1s update loop) and is interactive: hover any heatmap cell or pie legend row for the highlight states the real plugin implements. The outer rounded chrome is a generic placeholder for the Obsidian window — Time Grid itself only owns the panel content inside it.
