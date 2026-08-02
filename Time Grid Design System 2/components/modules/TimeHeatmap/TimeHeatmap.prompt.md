GitHub-style activity heatmap module — one column per week, one cell per day, intensity levels 0–4 — used as the flagship module of the Time Grid panel.

```jsx
<TimeHeatmap now={new Date()} weeks={24} />
```

Today's cell gets a gold ring (`--tg-today-ring`); future cells are dimmed to 45% opacity. Ships with deterministic demo data — pass real per-day levels in production.
