One row per Task Center section — icon chip, title + optional subtitle, count (or "match/total" while filtered), collapse chevron. Overdue/Today pass `fixed` to stay expanded with no chevron.

```jsx
<SectionHeader icon="!" title="逾期" subtitle="需要重新安排" count={18} accentColor="--tg-status-overdue" fixed />
<SectionHeader icon="▲" title="长期" count={2} matchCount={1} collapsed={collapsed} onToggle={...} accentColor="--tg-status-longterm" />
```
