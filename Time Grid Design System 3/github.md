repo: AForAaron/time-grid-obsidian
branch: main
## Last sync
date: 2026-08-01T13:47:00Z
### Updated in this project
- Added a Task Center redesign (`ui_kits/task-center/`) from the user's written spec + 3 reference screenshots — no `TaskPanel.ts`/`taskWriter.ts` source was available/attached this round (see `ui_kits/task-center/SPEC.md` intro caveat).
- New components: TaskCard, StatCard, SectionHeader, plus task-semantic color/shadow/touch-target tokens.
## Sync history
- 2026-08-01T12:29:04Z — Initial import: tokens, foundations CSS, 6 time-view components, 11 guideline cards, Time Grid Panel UI kit from `src/components/*.ts`, `src/styles/main.css`, `src/utils/icons.ts`; data-viz palette + pie geometry copied verbatim from `DailyPieChart.ts`/`main.css`.
## Screen map
| Design system artifact | Repo source |
|---|---|
| components/modules/TimeHeatmap | src/components/TimeHeatmap.ts |
| components/modules/MonthHeatmap | src/components/MonthHeatmap.ts |
| components/modules/DayGrid | src/components/DayGrid.ts |
| components/modules/HourGrid | src/components/HourGrid.ts |
| components/modules/DailyPieChart | src/components/DailyPieChart.ts |
| components/core/Icon, assets/icons/* | src/utils/icons.ts |
| foundations.css, tokens/*.css | src/styles/main.css |
| ui_kits/time-grid-panel | src/views/TimeGridView.ts |
