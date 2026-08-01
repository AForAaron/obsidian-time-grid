# Task Center — Redesign Spec

Companion to `index.html` (the interactive prototype — toggle width/theme/input-mode/state live) and `../../components/modules/{TaskCard,SectionHeader}`, `../../components/core/StatCard`. The production implementation is grounded in the repository's `TaskPanel.ts`, modal components and existing `TaskWriter`; this document defines the presentation layer only and does not replace Markdown parsing or write-safety rules.

## 1. Audit of the current screenshots

- Card anatomy is already close: checkbox → title → "…" menu, with a status pill below and a colored left border. Keep this shape.
- No due date, priority, or "今天/长期" section identity color is visible on the card itself in the screenshots (borders read as purple/blue/red but aren't legible as a system) — the accent-per-section idea needs an explicit token, not an incidental hue.
- "已结束" mixes 完成/取消 with identical card chrome except the checkbox glyph — matches your rule (differentiate via badge, not layout), but the badge alone is easy to miss at a glance; keeping distinct badge colors (green vs. neutral gray) is the fix, done in `TaskCard`.
- Stat cards, search, and a single "筛选" button are already present and already close to the target 280px layout — the redesign mainly needs the *popover* behind that button (not shown in your screenshots) and the six-section IA below.
- No hover/focus states, menus, or empty/loading states were visible in static screenshots — those are net-new in this spec.

## 2. Information architecture

```
Time Grid
 └─ 时间 / 任务 segmented switch (tablist, remembers last choice)
     └─ 任务中心 (Task Center)
          ├─ Header: title + subtitle, refresh button
          ├─ Stats: 总任务 / 逾期 / 今天 / 活跃
          ├─ Controls: search + one filter button (popover at every width)
          └─ Sections (fixed order):
               逾期 (fixed open) → 今天 (fixed open; optional 每日流程 group first)
               → 待分类 (collapsible)
               → 长期 (collapsible) → 未来 (collapsible; 明天 / 7天内 / 更晚)
               → 已结束 (collapsible; 完成 + 取消, distinct badges)
```
Search/filter state: session-only (not persisted). Section collapse state: persisted (e.g. plugin data) except 逾期/今天 which are always open.

`每日流程` is a reserved, optional `RoutineGroupViewModel`: title, completed count, total count, expanded state and display-only items. The card is omitted when the model is absent or empty. Routine detection, history deduplication, statistics and Markdown writes are explicitly outside this delivery.

## 3. Design tokens (task-specific additions)

All added to `tokens/colors.css` / `effects.css` / `spacing.css` in this design system; dark values are the primary scope, `.theme-light` overrides shown.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--tg-status-overdue` | `#d15a63` | `#c94a4a` | overdue date text, left border, badge |
| `--tg-status-today` | `--tg-accent` (`#8974d3`) | same | today section identity, "current" rings |
| `--tg-status-triage` | `#cda448` | `#b8863a` | 待分类 identity (amber) |
| `--tg-status-longterm` | `#a96bc8` | `#8a5fb0` | 长期 identity (purple) |
| `--tg-status-future` | `#418ad1` | `#2f76b8` | 未来 identity (blue) |
| `--tg-status-done` | `#4aa36f` | `#3f8f5f` | 完成 badge |
| `--tg-status-cancelled` | `--text-faint` | `--text-faint` | 取消 badge — neutral, not red/green |
| `--tg-status-readonly` | mix of red+muted | same idea, lighter | readonly chip/diagnostic text |
| `--surface-overlay` | `#1a1a1a`(gray-800) | `#ffffff` | menu/popover/hover-preview background |
| `--border-focus` | `--tg-accent-strong` | same | focus-visible ring |
| `--border-error` | `= status-overdue` | same | error/failed-write border |
| `--shadow-menu` | `0 4px 16px rgba(0,0,0,.18)` | same | status/more menus |
| `--shadow-popover` | `0 10px 30px rgba(0,0,0,.24)` | same | filter popover, hover preview |
| `--touch-min` / `--touch-comfortable` | `36px` / `44px` | same | minimum / preferred touch target |

Existing base tokens reused as-is: `--surface-panel/app/sunken`, `--border-default/subtle`, `--text-primary/muted/faint`, `--radius-sm(4)/md(8)/pill`, `--space-*`, `--font-ui`/`--font-mono`.

## 4. Component states (in `TaskCard`)

todo · doing · done (strikethrough title, green badge, reopenable) · cancelled (neutral gray badge, distinct from done) · unknown (readonly) · overdue (red due-date text, no full-card red fill) · readonly (dashed border, chip with reason, no checkbox, no hover actions, "打开源文件" still available) · writing (card opacity 0.6, no layout shift, disabled inputs).

Section identity color is a **prop** (`accentColor`), not baked into status — a 长期 task that's overdue still shows the red *date*, but its left border can stay purple (section identity) — pick one border owner per your visual preference; the prototype uses section-accent border + status-colored badge as the two independent channels, per your "combine icon+text+border+badge, never color alone" rule.

## 5. Responsive behavior

Built with a `container-type: inline-size` wrapper (`.task-center`) — rules key off the *panel* width, never `window`/`body`, via `@container`.

- **≤320px**: stats 2×2 fixed; search full-width; filter collapses to one badge-count button opening a popover *overlaying* the list (not pushing it down); task card shows checkbox + 2-line title + status + "…" only — date/priority de-emphasized into the second meta row and wrap/truncate before they push the card wider; no horizontal scroll anywhere (`overflow-x:hidden` at the container root, `min-width:0` on every flex/grid child that holds text).
- **321–520px**: stats stay in a stable 2×2; search owns its row and a single filter button opens the shared popover; hover actions only (no persistent icons); meta row (date/status/priority) stays on a stable second line under the title.
- **>520px**: stats single row; search + filter button share a row; hover actions right-align; content gets a `max-width` (e.g. 640px) centered so a wide panel doesn't stretch cards edge-to-edge indefinitely; source file still never becomes a persistent column.
- **Transition at 320/520px**: driven by `@container (min-width: …)` on `.task-center`/`.tc-stats`, so crossing the boundary only changes the rules scoped to that query — no JS re-layout, no reflow of unrelated siblings. To avoid visible "jumps", stat-card and card padding use the same values on both sides of each breakpoint; only grid columns and search/filter row arrangement change.
- **Scrollbar gutter**: `scrollbar-gutter: stable` on the scrolling list container so a toggling scrollbar doesn't shift content width and re-trigger a container-query boundary.
- **Third-party themes**: never rely on Obsidian's own button/select defaults — every control here is a plain `<button>`/`<div>` fully styled from this system's tokens, so a community theme's `button`/`select` overrides can't leak in. All width math uses `box-sizing:border-box` and `min-width:0` on text-bearing flex children to prevent overflow regardless of the host theme's font stack/size.

## 6. Menus & popovers

- **Status menu** (from the status badge): 4 radio-style items (`role="menuitemradio"`), current item checked, icon+label each, ↑↓ to move, Enter to pick, Esc to close.
- **"…" menu**: grouped — edit; postpone 1d/1w or "设为今天/设为长期" (mutually exclusive by whether `dueDate` exists); open source; delete (separated, danger-colored, opens the existing confirm modal — never deletes on click). Readonly tasks get a two-item menu: 查看只读原因, 打开源文件.
- **Filter popover** (same trigger and panel at every width): status / priority / source-file (scrollable, checkbox list, truncated paths) groups, footer with selected count + "清除全部" + "完成". Portaled to `document.body` and positioned against the trigger, so it never pushes the section list down or gets clipped by the task scroller; closes on outside click, scroll, window blur, Esc, or Enter on 完成.
- **Hover preview** (desktop only, 300ms in / 100–150ms out, bridged so moving mouse from title → preview doesn't flicker-close): fixed-position layer, flips right→left→below on edge collision, closes on scroll/Esc/blur/focus-out, read-only content (no write affordances), keyboard `focus-visible` on the title shows the same content.

## 7. Accessibility

- Segment switch: `role="tablist"`/`role="tab"` + `aria-selected`, ←/→ moves selection.
- Section header: native `<button aria-expanded>` (omitted — not `false` — on fixed 逾期/今天 sections, since they can't collapse).
- Status badge & "…" button: `aria-haspopup="menu"`; menus are `role="menu"`/`role="menuitemradio"`/`role="menuitem"`.
- Search input has a real (visually-hidden) `<label>`; clear button has `aria-label="清空搜索"`.
- Checkbox is a `<button aria-label>` describing the resulting action ("标记为完成"/"重新打开为待办"), not a bare native checkbox missing task context.
- Readonly reason text is real text content (not a title-only tooltip) so it's screen-reader reachable.
- Hover preview is `role="tooltip"`, associated to the title via `aria-describedby`.
- Refresh button: `aria-busy="true"` while spinning; write failures use `role="alert"`.
- All status/section color pairs also carry an icon + text label — never color-only.
- `:focus-visible` uses `--border-focus`, a 2px outline with offset, distinct from hover.
- `prefers-reduced-motion: reduce` collapses shimmer/spin/transition durations to ~0.

## 8. DOM structure (recommended)

```
.time-grid-view
  .tg-switcher[role=tablist]
  .task-center[container-type=inline-size]
    header: .tc-header-title/.tc-header-sub, .tc-refresh[aria-busy]
    .tc-stats (grid) → StatCard × 4
    .tc-search-row: .tc-search(input+clear), .tc-filter-btn
    .tc-sections
      .tc-section
        SectionHeader (button, aria-expanded)
        .tc-section-body
          .tc-future-group (labels only, inside 未来)
          TaskCard × n (article-like div; checkbox=button, title=span/button, menu trigger=button)
    portals (rendered at body level, not inside the scroll container):
      .tg-menu (status / more)
      .tg-popover (filter)
      .tg-hover-preview
```
- Use CSS Grid for `.tc-stats` (fixed 2×2 / 1×4), Flexbox for everything else (rows, chip wrap, card internals).
- `min-width: 0` on: `.tc-header-title` wrapper, `.tc-search input`'s flex parent, `TaskCard`'s title span, `SectionHeader`'s title/subtitle wrapper.
- `-webkit-line-clamp: 2` (+ `display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden`) on the task title only.
- `overflow: hidden` on the title clamp and on `.tc-search`/chip rows (never on the whole `.task-center`, which needs `overflow-y:auto`).
- Menus/popovers/hover-preview should be **portaled** (rendered outside the scrolling list, `position: fixed`/`absolute` against viewport or a top-level anchor) so they aren't clipped by `.task-center`'s `overflow-y:auto` and never participate in list reflow.
- Avoid `!important` everywhere except one place: a single guard rule neutralizing a hostile third-party-theme `button`/`select` reset (e.g. `.task-center button{appearance:none!important}`) — scoped to that one property, on that one selector, nowhere else.

## 9. Acceptance checklist

- [ ] 时间/任务 switcher defaults to 时间 on first open, remembers last view after
- [ ] Time-view high-frequency refresh pauses while Task Center is the active view; task index keeps working regardless
- [ ] 4 stat numbers (总任务/逾期/今天/活跃) match section contents
- [ ] Search covers description + tags + file path, case-insensitive
- [ ] Same-category filters OR, cross-category filters AND, search+filter combine
- [ ] Section counts show `match/total` only while a search/filter is active
- [ ] 未来 splits into 明天 / 7天内 / 更晚, in that order
- [ ] 已结束 merges 完成+取消 with visually distinct badges
- [ ] Optional 每日流程 group renders first in 今天, shows `completed/total`, and is hidden for absent/empty data
- [ ] 逾期/今天 always expanded, no collapse affordance shown
- [ ] Other sections remember collapsed/expanded state
- [ ] Title clamps at 2 lines, ellipsis, never breaks card width
- [ ] Desktop: ~300ms hover → full preview; preview survives mouse moving into it; closes on scroll/Esc/blur
- [ ] Touch: tap title toggles inline expand only, never opens edit; edit/postpone/delete/open-source live only in "…"
- [ ] Checkbox only toggles complete/reopen; status badge opens the 4-state menu
- [ ] Delete always confirms before writing
- [ ] Readonly tasks show zero write-looking affordances, still offer "打开源文件"
- [ ] ≤280px: no horizontal scroll, no button-brick rows
- [ ] 320px boundary: no layout break
- [ ] 420px: search remains full-width and the single filter trigger never overflows the panel
- [ ] 520px boundary: transition has no visible jump (padding/sizes constant, only arrangement changes)
- [ ] ≥720px: stats single row, search+filter share a row, content has a max-width
- [ ] Full dark and light theme coverage
- [ ] `:focus-visible` visible in both themes
- [ ] `prefers-reduced-motion` honored
- [ ] No changes to Markdown format, TaskWriter locate rules, or Vault.process() atomic writes
- [ ] No "new task", no batch actions, no drag reorder, no recurrence editor anywhere in this surface
- [ ] No routine detection, historical deduplication, routine statistics, or routine Markdown writes
