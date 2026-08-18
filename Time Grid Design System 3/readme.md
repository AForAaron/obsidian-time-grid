# Time Grid Design System

Design system for **Time Grid**, a minimalist Obsidian plugin ("极简主义的时间管理与可视化工具 · 向死而生 / Memento Mori") that lives in Obsidian's right sidebar and shows five stacked time-awareness modules: a 24-week activity heatmap, the current month's calendar, a 24-hour grid, a 60-minute grid, and today's time-tracker ring chart.

**Source:** [github.com/AForAaron/time-grid-obsidian](https://github.com/AForAaron/time-grid-obsidian) (branch `main`) — a small, single-surface open-source Obsidian community plugin, no separate marketing site or app. Explore the repo directly for the TypeScript source (`src/components/*.ts`, `src/styles/main.css`) this system was built from; it will let you go deeper than what's captured here (e.g. the daily-notes parsing logic, `simple-time-tracker` integration).

Because Time Grid is a plugin, not a standalone app, it normally inherits its host Obsidian theme's CSS variables (`--background-primary`, `--interactive-accent`, etc.) rather than shipping its own palette. This design system gives those inherited roles concrete, standalone values calibrated to Obsidian's own default dark theme, so the system can be used outside of Obsidian (decks, mocks, marketing).

## Index

- `styles.css` — root stylesheet, imports everything below
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`
- `foundations.css` — component-level CSS classes (`.tg-module`, `.tg-heatmap-*`, `.tg-pie-*`, …) shared by every component
- `assets/icons/` — the 6 raw SVG glyphs
- `components/core/Icon` — the glyph wrapper
- `components/modules/` — `TimeHeatmap`, `MonthHeatmap`, `DayGrid`, `HourGrid`, `DailyPieChart`
- `guidelines/` — 11 foundation specimen cards (Colors, Type, Spacing, Brand)
- `ui_kits/time-grid-panel/` — the assembled, live-ticking sidebar recreation (time view)
- `ui_kits/task-center/` — interactive Task Center redesign (280/420/720px × dark/light, all states) + `SPEC.md` dev handoff doc
- `SKILL.md` — Claude Code–compatible skill wrapper

## Components

- **Icon** — 6-glyph monochrome line icon (`components/core/Icon`)
- **TimeHeatmap** — 24-week activity heatmap (`components/modules/TimeHeatmap`)
- **MonthHeatmap** — current-month calendar grid (`components/modules/MonthHeatmap`)
- **DayGrid** — 24-hour progress grid (`components/modules/DayGrid`)
- **HourGrid** — 60-minute progress grid + live clock (`components/modules/HourGrid`)
- **DailyPieChart** — today's time-tracker ring + legend (`components/modules/DailyPieChart`)
- **StatCard** — compact metric tile for Task Center's header stats (`components/core/StatCard`)
- **TaskCard** — content-first task row covering todo/doing/done/cancelled/overdue/readonly/writing states (`components/modules/TaskCard`)
- **SectionHeader** — collapsible section row with icon, count, and match/total state (`components/modules/SectionHeader`)
- **Button** — 4-tier action hierarchy: primary / neutral / danger-quiet / quiet (`components/core/Button`)
- **SuggestionChips** — recent/task/routine quick-start pill chips, hides empty groups (`components/modules/SuggestionChips`)
- **TimerPanel** — the time view's one timer entry point (start/stop/atomic switch), covering idle/running/conflict/invalid/write-error/cross-day-recovery (`components/modules/TimerPanel`)

The first five modules were the *time view*'s original component inventory, which shipped no buttons, inputs, or dialogs. Button/SuggestionChips/TimerPanel were added later for the in-panel timer control feature and are the system's only interactive form/action primitives. No logo exists in the source repo; the design system renders "Time Grid" / "时间网格" as plain type wherever a mark would go.

## Content fundamentals

- **Language**: all UI copy is Simplified Chinese (今日, 本月, 活动热力图, 已记录…); no English strings in the product surface itself.
- **Voice**: terse, functional, label-like — module titles are two to four characters ("本月", "当下 (60m)", "今日计时分布"), never a full sentence. No greetings, no "you/your" address — the UI states facts about time, it doesn't talk to the user.
- **Tone**: matches the "向死而生" (memento mori) framing in the README — quietly serious rather than motivational or gamified. No streak-shaming, no celebratory copy, no exclamation points.
- **Status copy** is precise and conditional, e.g. `今日还没有日记 · 创建后自动统计` (no diary yet · auto-tracked once created), `simple-time-tracker 格式有误` (format error) — it names the exact condition rather than a generic "no data" placeholder.
- **Numerals**: always tabular/monospace, always with explicit units inline (`3h 42m`, `62%`, `02:15:47`) — never a bare number.
- **No emoji, no icon-as-copy** — the six line icons are the only non-text glyphs; status is communicated by color and a small pulsing dot, never by emoji.

## Visual foundations

- **Palette**: dark-first neutral scale (`--tg-gray-950…50`) calibrated to Obsidian's default dark theme, plus one desaturated purple accent (`--tg-accent`, `#8974d3`) used only for the "current" outline and "today" ring — never as a fill. A `.theme-light` scope supplies an Obsidian-light-theme equivalent. A separate 8-hue **data-visualization palette** (`--tg-viz-1…8`) is hashed per activity name for the pie chart and heatmap legend — it is the only place saturated color appears.
- **Type**: Inter for all UI text (Obsidian's actual shipped default font — confirmed, not a guess), monospace (`ui-monospace, SFMono-Regular, Menlo…`) for every clock, duration, and percentage. Scale runs a compact 10–21px — this is a sidebar panel, not a marketing page.
- **Spacing**: a small base scale (2–24px) for gaps/padding, plus fixed, non-scale cell sizes per grid (20px month/day cells, 16px minute cells, 10px heatmap cells, 18px hour-cell height) — these are deliberately off the base scale because each grid's cell count is fixed (24, 60, 7×N) and the cell size is solved for available width, not chosen from a ramp.
- **Backgrounds**: flat solid panels only — no gradients, no imagery, no photography, no patterns or textures. Every module is a bordered, softly-rounded rectangle (`--radius-md` 8px) sitting on the app background.
- **Animation**: minimal and utilitarian — a 0.12s translateY(-1px) lift on heatmap-cell hover, a 0.2–0.35s ease color-fade when a cell's level changes, and a 1.6s ease-in-out opacity/scale pulse on the "recording in progress" dot. No page transitions, no spring/bounce easing, no entrance animations.
- **Hover states**: nav buttons and heatmap cells get a subtle `surface-hover` tint or a 1px lift; pie legend rows get a faint accent-tinted row background plus non-hovered rows/segments dimming to ~30–52% opacity (cross-highlight between SVG ring and legend list).
- **Press states**: not designed in the source — the plugin has no explicit active/pressed treatment beyond the hover states above.
- **Borders**: every module and cell uses a single 1px `border-default` stroke; the "today" and "current" states upgrade to a 1.5–2px accent-colored ring/border instead of a fill change.
- **Shadows**: exactly one — a soft `0 8px 24px rgba(0,0,0,0.22)` drop shadow, used only on the heatmap day-tooltip (a floating, cursor-following popover). Cards/modules themselves carry no shadow, only a border.
- **Corner radii**: 8px for module panels, 4px for grid cells, full pill (999px) for the heatmap legend bar and running-status dot.
- **Cards**: bordered rectangle, flat fill, 16px internal padding, no shadow — see "Borders"/"Shadows" above; this is the one card pattern used everywhere (`.tg-module`).
- **Transparency/blur**: `color-mix()` is used extensively to derive heatmap intensity levels and muted tones from the accent/border colors, but there is no `backdrop-filter` blur or translucency anywhere — the plugin is not a floating/overlay surface.
- **Imagery**: none — Time Grid contains zero photography or illustration; it is pure data-grid UI.

## Iconography

- **System**: a hand-authored, single-path SVG set of exactly 6 glyphs (`month`, `day`, `hour`, `pie`, `chevronLeft`, `chevronRight`) — see `src/utils/icons.ts` in the source. All are `viewBox="0 0 24 24"`, `fill="currentColor"`, no stroke-based icons.
- **No icon font, no external icon library, no emoji, no unicode symbols as icons** — copied verbatim into `assets/icons/*.svg` and wrapped by the `Icon` component here.
- Icons are used exactly once per module header (identifying which grid it is) plus twice for heatmap pagination — never decoratively, never inline with body text.

## Caveats & how you can help

- **No font files were provided** — Inter is Time Grid's real, confirmed default (it's Obsidian's own shipped UI font per Obsidian's theme-settings schema), loaded here from Google Fonts. If you have Obsidian's exact bundled Inter `.woff2` files, attach them and I'll self-host instead of linking Google Fonts.
- **No logo/wordmark exists in the source** — the plugin has no brand mark, only a generic Lucide "clock" icon supplied by Obsidian itself (not part of this repo, so not copied). If Time Grid gets a real logo later, attach it and I'll wire it into `assets/` and the thumbnail.
- **Colors are a standalone calibration, not shipped values** — the real plugin inherits whatever Obsidian theme the user has installed; the palette here is my best-effort default-dark-theme approximation. Flag if you want it recalibrated to a specific theme (e.g. a specific community theme, or Obsidian's light mode as primary).
- This is a very narrow, single-plugin source — there was no marketing site, deck, or multi-surface product to build additional UI kits from. If Time Grid grows a companion site or docs, attach that repo and I'll extend this system.

Tell me what's off and I'll iterate.
