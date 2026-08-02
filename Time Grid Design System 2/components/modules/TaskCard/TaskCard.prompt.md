Content-first, two-tier task row: checkbox + up-to-two-line title + "…" menu on top, due date / status badge / priority / readonly chip below. Never shows edit/postpone/delete as persistent buttons — only on hover (desktop) or via the "…" menu.

```jsx
<TaskCard title="Draft Q3 roadmap" status="doing" accentColor="--tg-status-today" dueDate="今天" priority="P2" onToggle={...} onMore={...} onEdit={...} onPostpone={...} />
```

Set `readonly` + `readonlyReason` for recurring/malformed/unknown-status tasks — this removes the checkbox and hover actions and switches the card border to dashed. `writing` dims the card during an in-flight Markdown write without shifting layout.
