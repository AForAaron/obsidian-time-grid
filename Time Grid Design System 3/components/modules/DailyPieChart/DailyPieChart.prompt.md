Today's time-tracker ring chart — one segment per named activity, center shows total recorded duration, legend rows and ring segments cross-highlight on hover.

```jsx
<DailyPieChart buckets={[{ name: '写作', durationMs: 9000000 }, { name: '会议', durationMs: 2880000, isRunning: true }]} />
```

Unrecorded time (remainder of 24h) always renders as a muted "未记录" row/segment. Segment colors are hashed from the bucket name against the 8-color data-viz palette.
