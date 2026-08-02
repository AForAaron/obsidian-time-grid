/* @ds-bundle: {"format":4,"namespace":"TimeGridDesignSystem_80c9b5","components":[{"name":"Icon","sourcePath":"components/core/Icon/Icon.jsx"},{"name":"StatCard","sourcePath":"components/core/StatCard/StatCard.jsx"},{"name":"DailyPieChart","sourcePath":"components/modules/DailyPieChart/DailyPieChart.jsx"},{"name":"DayGrid","sourcePath":"components/modules/DayGrid/DayGrid.jsx"},{"name":"HourGrid","sourcePath":"components/modules/HourGrid/HourGrid.jsx"},{"name":"MonthHeatmap","sourcePath":"components/modules/MonthHeatmap/MonthHeatmap.jsx"},{"name":"SectionHeader","sourcePath":"components/modules/SectionHeader/SectionHeader.jsx"},{"name":"TaskCard","sourcePath":"components/modules/TaskCard/TaskCard.jsx"},{"name":"TimeHeatmap","sourcePath":"components/modules/TimeHeatmap/TimeHeatmap.jsx"}],"sourceHashes":{"components/core/Icon/Icon.jsx":"66ab4abde247","components/core/StatCard/StatCard.jsx":"d939af44cb52","components/modules/DailyPieChart/DailyPieChart.jsx":"944bd302ceae","components/modules/DayGrid/DayGrid.jsx":"d4cbe95078ee","components/modules/HourGrid/HourGrid.jsx":"2dc68efd7372","components/modules/MonthHeatmap/MonthHeatmap.jsx":"25575aa565f5","components/modules/SectionHeader/SectionHeader.jsx":"7f65b42012d7","components/modules/TaskCard/TaskCard.jsx":"8fea89816cb4","components/modules/TimeHeatmap/TimeHeatmap.jsx":"38d68ac44654"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TimeGridDesignSystem_80c9b5 = window.TimeGridDesignSystem_80c9b5 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Icon/Icon.jsx
try { (() => {
const PATHS = {
  month: 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4zm6 0h4v4h-4v-4zM7 16h4v4H7v-4zm6 0h4v4h-4v-4z',
  day: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zm0-2a10 10 0 1 1 0 20a10 10 0 0 1 0-20zm1 5h-2v6l5 3l1-1.732-4-2.268V7z',
  hour: 'M9 2h6v2H9V2zm3 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm1 2h-2v4.5l3.5 2.1l1-1.7-2.5-1.4V9z',
  pie: 'M11 2v9H2a10 10 0 0 1 9-9zm2 0a10 10 0 1 1-4.9 18.7L13 11V2z',
  chevronLeft: 'M15.4 5.6L14 4.2L6.2 12l7.8 7.8l1.4-1.4L9 12l6.4-6.4z',
  chevronRight: 'M8.6 18.4L10 19.8l7.8-7.8L10 4.2L8.6 5.6L15 12l-6.4 6.4z'
};
function Icon(props) {
  const {
    name,
    size = 16
  } = props;
  const d = PATHS[name];
  if (!d) return null;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false"
  }, /*#__PURE__*/React.createElement("path", {
    d: d
  })));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/StatCard/StatCard.jsx
try { (() => {
function StatCard(props) {
  const {
    icon,
    value,
    label,
    accentColor
  } = props;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      fontFamily: 'var(--font-ui)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 8,
      flex: '0 0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: accentColor ? `color-mix(in srgb, var(${accentColor}) 16%, transparent)` : 'var(--surface-hover)',
      color: accentColor ? `var(${accentColor})` : 'var(--text-muted)',
      fontSize: 14
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 700,
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)'
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, label)));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatCard/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/modules/DailyPieChart/DailyPieChart.jsx
try { (() => {
const RADIUS = 58;
const CIRC = 2 * Math.PI * RADIUS;
const DAY_MS = 24 * 60 * 60 * 1000;
const COLOR_CLASSES = ['tg-pie-slice-0', 'tg-pie-slice-1', 'tg-pie-slice-2', 'tg-pie-slice-3', 'tg-pie-slice-4', 'tg-pie-slice-5', 'tg-pie-slice-6', 'tg-pie-slice-7'];
function formatDuration(ms, includeSeconds) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600),
    m = Math.floor(total % 3600 / 60),
    s = total % 60;
  if (includeSeconds) return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatPercent(v) {
  return v >= 10 || v === 0 ? `${Math.round(v)}%` : `${Math.round(v * 10) / 10}%`;
}
function colorClass(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return COLOR_CLASSES[h % COLOR_CLASSES.length];
}
function DailyPieChart(props) {
  const {
    buckets = [{
      name: '写作',
      durationMs: 2.5 * 3600000,
      isRunning: false
    }, {
      name: '阅读',
      durationMs: 1.1 * 3600000,
      isRunning: false
    }, {
      name: '会议',
      durationMs: 0.8 * 3600000,
      isRunning: true
    }, {
      name: '锻炼',
      durationMs: 0.5 * 3600000,
      isRunning: false
    }]
  } = props;
  const [hoverKey, setHoverKey] = React.useState(null);
  const hasData = buckets.length > 0;
  const total = buckets.reduce((s, b) => s + b.durationMs, 0);
  const remainder = Math.max(0, DAY_MS - total);
  const runningCount = buckets.filter(b => b.isRunning).length;
  const display = buckets.map(b => ({
    ...b,
    key: b.name,
    colorClass: colorClass(b.name)
  }));
  let offset = 0;
  const segments = display.map(b => {
    const raw = b.durationMs / DAY_MS * CIRC;
    const gap = display.length > 1 ? 2.5 : 0;
    const len = Math.max(0.75, Math.min(CIRC, raw - gap));
    const seg = {
      ...b,
      len,
      offset
    };
    offset += raw;
    return seg;
  });
  const rows = [...display, ...(remainder > 0 ? [{
    key: '__unrecorded',
    name: '未记录',
    durationMs: remainder,
    colorClass: 'tg-pie-slice-muted'
  }] : [])];
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-module"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-module-title"
  }, "\u4ECA\u65E5\u8BA1\u65F6\u5206\u5E03"), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "pie",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-chart"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 144 144",
    width: 140,
    height: 140
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "72",
    cy: "72",
    r: RADIUS,
    fill: "none",
    className: hasData ? 'tg-pie-ring-track' : 'tg-pie-ring-empty',
    stroke: "var(--tg-pie-track,var(--border-subtle))",
    strokeWidth: "14",
    strokeDasharray: hasData ? undefined : '1.5 7.5',
    strokeLinecap: hasData ? 'butt' : 'round'
  }), /*#__PURE__*/React.createElement("g", {
    transform: "rotate(-90 72 72)"
  }, segments.map(seg => /*#__PURE__*/React.createElement("circle", {
    key: seg.key,
    cx: "72",
    cy: "72",
    r: RADIUS,
    fill: "none",
    strokeWidth: hoverKey === seg.key ? 17 : 14,
    style: {
      opacity: hoverKey && hoverKey !== seg.key ? 0.3 : 1,
      transition: 'opacity .18s ease,stroke-width .18s ease',
      cursor: 'pointer'
    },
    className: seg.colorClass,
    stroke: `var(--tg-viz-${COLOR_CLASSES.indexOf(seg.colorClass) % 8 + 1})`,
    strokeDasharray: `${seg.len.toFixed(2)} ${(CIRC - seg.len).toFixed(2)}`,
    strokeDashoffset: (-seg.offset).toFixed(2),
    onMouseEnter: () => setHoverKey(seg.key),
    onMouseLeave: () => setHoverKey(null)
  })))), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-center-value"
  }, formatDuration(total, runningCount > 0)), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-center-label"
  }, hasData ? '已记录' : '今日暂无记录'))), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-legend"
  }, rows.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.key,
    className: `tg-pie-legend-row${hoverKey === b.key ? ' active' : ''}${hoverKey && hoverKey !== b.key ? ' dimmed' : ''}`,
    onMouseEnter: () => setHoverKey(b.key),
    onMouseLeave: () => setHoverKey(null)
  }, /*#__PURE__*/React.createElement("span", {
    className: `tg-pie-legend-swatch ${b.colorClass}`
  }), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-legend-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-pie-legend-name"
  }, b.name), b.isRunning && /*#__PURE__*/React.createElement("span", {
    className: "tg-pie-running-badge"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-pie-dot"
  }), "\u8FDB\u884C\u4E2D")), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-legend-value"
  }, formatDuration(b.durationMs)), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-legend-percent"
  }, formatPercent(b.durationMs / DAY_MS * 100)), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-legend-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: `tg-pie-legend-bar-fill ${b.colorClass}`,
    style: {
      width: `${Math.min(100, b.durationMs / DAY_MS * 100).toFixed(1)}%`
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "tg-pie-status"
  }, runningCount > 0 && /*#__PURE__*/React.createElement("span", {
    className: "tg-pie-dot"
  }), /*#__PURE__*/React.createElement("span", null, runningCount > 0 ? `${runningCount} 段进行中 · 实时更新` : `共 ${buckets.length} 段计时`))));
}
Object.assign(__ds_scope, { DailyPieChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/DailyPieChart/DailyPieChart.jsx", error: String((e && e.message) || e) }); }

// components/modules/DayGrid/DayGrid.jsx
try { (() => {
function DayGrid(props) {
  const {
    now = new Date()
  } = props;
  const currentHour = now.getHours();
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-module"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-module-title"
  }, "\u4ECA\u65E5 (24h)"), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "day",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "tg-day-grid"
  }, Array.from({
    length: 24
  }, (_, hour) => {
    const state = hour < currentHour ? 'past' : hour === currentHour ? 'current' : 'future';
    return /*#__PURE__*/React.createElement("div", {
      key: hour,
      className: `tg-hour-cell ${state}`
    }, hour);
  })));
}
Object.assign(__ds_scope, { DayGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/DayGrid/DayGrid.jsx", error: String((e && e.message) || e) }); }

// components/modules/HourGrid/HourGrid.jsx
try { (() => {
function HourGrid(props) {
  const {
    now = new Date()
  } = props;
  const currentMinute = now.getMinutes();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-module"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-module-title"
  }, "\u5F53\u4E0B (60m)"), /*#__PURE__*/React.createElement("span", {
    className: "tg-time-display"
  }, timeStr), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "hour",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "tg-hour-grid"
  }, Array.from({
    length: 60
  }, (_, minute) => {
    const state = minute < currentMinute ? 'past' : minute === currentMinute ? 'current' : 'future';
    return /*#__PURE__*/React.createElement("div", {
      key: minute,
      className: `tg-minute-cell ${state}`
    });
  })));
}
Object.assign(__ds_scope, { HourGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/HourGrid/HourGrid.jsx", error: String((e && e.message) || e) }); }

// components/modules/MonthHeatmap/MonthHeatmap.jsx
try { (() => {
function MonthHeatmap(props) {
  const {
    now = new Date()
  } = props;
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({
    empty: true,
    key: `e${i}`
  });
  for (let day = 1; day <= daysInMonth; day++) {
    const state = day < today ? 'past' : day === today ? 'current' : 'future';
    cells.push({
      day,
      state,
      key: day
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-module"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-module-title"
  }, "\u672C\u6708"), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "month",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "tg-month-grid"
  }, ['一', '二', '三', '四', '五', '六', '日'].map(l => /*#__PURE__*/React.createElement("div", {
    key: l,
    className: "tg-week-label"
  }, l)), cells.map(c => c.empty ? /*#__PURE__*/React.createElement("div", {
    key: c.key,
    className: "tg-month-day empty"
  }) : /*#__PURE__*/React.createElement("div", {
    key: c.key,
    className: `tg-month-day ${c.state}`
  }, c.day))));
}
Object.assign(__ds_scope, { MonthHeatmap });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/MonthHeatmap/MonthHeatmap.jsx", error: String((e && e.message) || e) }); }

// components/modules/SectionHeader/SectionHeader.jsx
try { (() => {
function SectionHeader(props) {
  const {
    icon,
    title,
    subtitle,
    count,
    matchCount,
    fixed = false,
    collapsed = false,
    onToggle,
    accentColor
  } = props;
  const showRatio = matchCount !== undefined && matchCount !== count;
  return /*#__PURE__*/React.createElement("button", {
    onClick: fixed ? undefined : onToggle,
    "aria-expanded": fixed ? undefined : !collapsed,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      cursor: fixed ? 'default' : 'pointer',
      fontFamily: 'var(--font-ui)',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 7,
      flex: '0 0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: accentColor ? `color-mix(in srgb, var(${accentColor}) 16%, transparent)` : 'var(--surface-hover)',
      color: accentColor ? `var(${accentColor})` : 'var(--text-muted)',
      fontSize: 13
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, subtitle)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-muted)',
      background: 'var(--surface-hover)',
      borderRadius: 'var(--radius-pill)',
      padding: '2px 8px',
      flex: '0 0 auto'
    }
  }, showRatio ? `${matchCount} / ${count}` : count), !fixed && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      transform: collapsed ? 'rotate(-90deg)' : 'none',
      transition: 'transform .15s ease'
    }
  }, "\u2304"));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/SectionHeader/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/modules/TaskCard/TaskCard.jsx
try { (() => {
const STATUS_LABEL = {
  todo: '待办',
  doing: '进行中',
  done: '完成',
  cancelled: '取消',
  unknown: '未知状态'
};
const STATUS_COLOR_VAR = {
  todo: '--text-muted',
  doing: '--tg-status-today',
  done: '--tg-status-done',
  cancelled: '--tg-status-cancelled',
  unknown: '--tg-status-readonly'
};
function TaskCard(props) {
  const {
    title,
    status = 'todo',
    accentColor,
    dueDate,
    overdue = false,
    priority,
    readonly = false,
    readonlyReason,
    sourceFile,
    writing = false,
    onToggle,
    onMore,
    onTitleClick,
    onEdit,
    onPostpone
  } = props;
  const checked = status === 'done' || status === 'cancelled';
  const canCheck = !readonly && status !== 'unknown';
  const statusVar = STATUS_COLOR_VAR[status] || '--text-muted';
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-task-card",
    style: {
      position: 'relative',
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-default)',
      borderLeft: `3px solid ${accentColor ? `var(${accentColor})` : 'var(--border-default)'}`,
      borderStyle: readonly ? 'dashed' : 'solid',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      opacity: writing ? 0.6 : 1,
      fontFamily: 'var(--font-ui)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": checked ? '重新打开为待办' : '标记为完成',
    disabled: !canCheck,
    onClick: onToggle,
    style: {
      width: 18,
      height: 18,
      marginTop: 2,
      flex: '0 0 auto',
      borderRadius: 4,
      cursor: canCheck ? 'pointer' : 'default',
      border: `1.5px solid ${checked ? 'var(--tg-status-done)' : 'var(--border-default)'}`,
      background: status === 'done' ? 'var(--tg-status-done)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0
    }
  }, status === 'done' && /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "12",
    height: "12",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 13l4 4L19 7"
  })), status === 'cancelled' && /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "11",
    height: "11",
    fill: "none",
    stroke: "var(--text-faint)",
    strokeWidth: "3"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6L6 18"
  }))), /*#__PURE__*/React.createElement("span", {
    onClick: onTitleClick,
    tabIndex: 0,
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-primary)',
      cursor: onTitleClick ? 'pointer' : 'default',
      textDecoration: status === 'done' ? 'line-through' : 'none',
      opacity: status === 'done' ? 0.65 : 1,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      lineHeight: 1.3
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u66F4\u591A\u64CD\u4F5C",
    "aria-haspopup": "menu",
    onClick: onMore,
    style: {
      flex: '0 0 auto',
      width: 26,
      height: 26,
      borderRadius: 6,
      border: '1px solid var(--border-default)',
      background: 'var(--surface-panel)',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "\u22EF")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      paddingLeft: 26
    }
  }, dueDate && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)',
      color: overdue ? 'var(--tg-status-overdue)' : 'var(--text-muted)'
    }
  }, dueDate), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-2xs)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid var(${statusVar})`,
      color: `var(${statusVar})`
    }
  }, STATUS_LABEL[status]), priority && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-faint)'
    }
  }, priority), readonly && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--tg-status-readonly)'
    }
  }, readonlyReason || '只读')), sourceFile && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-faint)',
      paddingLeft: 26,
      fontFamily: 'var(--font-mono)'
    }
  }, sourceFile), !readonly && (onEdit || onPostpone) && /*#__PURE__*/React.createElement("div", {
    className: "tg-task-hover-actions",
    style: {
      position: 'absolute',
      top: 8,
      right: 40,
      display: 'flex',
      gap: 4,
      opacity: 0,
      transition: 'opacity .12s ease'
    }
  }, onEdit && /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u7F16\u8F91\u4EFB\u52A1",
    onClick: onEdit,
    style: {
      width: 22,
      height: 22,
      borderRadius: 5,
      border: '1px solid var(--border-default)',
      background: 'var(--surface-panel)',
      color: 'var(--text-muted)',
      cursor: 'pointer'
    }
  }, "\u270E"), onPostpone && /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u987A\u5EF6\u4E00\u5929",
    onClick: onPostpone,
    style: {
      width: 22,
      height: 22,
      borderRadius: 5,
      border: '1px solid var(--border-default)',
      background: 'var(--surface-panel)',
      color: 'var(--text-muted)',
      cursor: 'pointer'
    }
  }, "\xBB")), /*#__PURE__*/React.createElement("style", null, `.tg-task-card:hover .tg-task-hover-actions{opacity:1}`));
}
Object.assign(__ds_scope, { TaskCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/TaskCard/TaskCard.jsx", error: String((e && e.message) || e) }); }

// components/modules/TimeHeatmap/TimeHeatmap.jsx
try { (() => {
function pad(n) {
  return String(n).padStart(2, '0');
}
function seededLevel(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = h * 31 + dateKey.charCodeAt(i) >>> 0;
  const r = h % 100;
  if (r < 30) return 0;
  if (r < 55) return 1;
  if (r < 75) return 2;
  if (r < 90) return 3;
  return 4;
}
function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const idx = r.getDay() === 0 ? 6 : r.getDay() - 1;
  r.setDate(r.getDate() - idx);
  return r;
}
function TimeHeatmap(props) {
  const {
    now = new Date(),
    weeks: weeksToShow = 24
  } = props;
  const weekStart = startOfWeek(now);
  const columns = [];
  const monthLabels = [];
  let lastMonth = -1;
  let activeDays = 0,
    totalHours = 0;
  for (let w = 0; w < weeksToShow; w++) {
    const col = [];
    const colStart = new Date(weekStart);
    colStart.setDate(weekStart.getDate() + (w - (weeksToShow - 1)) * 7);
    if (colStart.getMonth() !== lastMonth && colStart.getDate() <= 7) {
      monthLabels.push({
        w,
        label: `${colStart.getMonth() + 1}月`
      });
      lastMonth = colStart.getMonth();
    }
    for (let d = 0; d < 7; d++) {
      const date = new Date(colStart);
      date.setDate(colStart.getDate() + d);
      const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const isToday = date.toDateString() === now.toDateString();
      const isFuture = date > now;
      const level = isFuture ? 0 : seededLevel(dateKey);
      if (level > 0) {
        activeDays++;
        totalHours += level * 0.6;
      }
      col.push({
        dateKey,
        level,
        isToday,
        isFuture
      });
    }
    columns.push(col);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "tg-module tg-heatmap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-module-heading"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-module-title"
  }, "\u6D3B\u52A8\u70ED\u529B\u56FE"), /*#__PURE__*/React.createElement("span", {
    className: "tg-heatmap-summary"
  }, "\u8FD1", weeksToShow, "\u5468 \xB7 \u8BA1\u65F6 ", activeDays, "\u5929 / ", totalHours.toFixed(1), "h")), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tg-nav-btn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevronLeft",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    className: "tg-nav-btn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevronRight",
    size: 14
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "month",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-weekdays"
  }, ['一', '', '三', '', '五', '', '日'].map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "tg-heatmap-weekday"
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-month-labels",
    style: {
      gridTemplateColumns: `repeat(${weeksToShow}, var(--tg-heatmap-cell-size))`
    }
  }, monthLabels.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.w,
    className: "tg-heatmap-month-label",
    style: {
      gridColumn: m.w + 1
    }
  }, m.label))), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-week-grid"
  }, columns.map((col, w) => /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-week-col",
    key: w
  }, col.map((cell, d) => /*#__PURE__*/React.createElement("div", {
    key: d,
    title: cell.dateKey,
    className: `tg-heatmap-cell level-${cell.level}${cell.isToday ? ' today' : ''}${cell.isFuture ? ' future' : ''}`
  }))))))), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-legend"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tg-heatmap-legend-label"
  }, "\u5C11"), /*#__PURE__*/React.createElement("div", {
    className: "tg-heatmap-legend-bar"
  }, [0, 1, 2, 3, 4].map(l => /*#__PURE__*/React.createElement("span", {
    key: l,
    className: `tg-heatmap-legend-seg level-${l}`
  }))), /*#__PURE__*/React.createElement("span", {
    className: "tg-heatmap-legend-label"
  }, "\u591A")));
}
Object.assign(__ds_scope, { TimeHeatmap });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/modules/TimeHeatmap/TimeHeatmap.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.DailyPieChart = __ds_scope.DailyPieChart;

__ds_ns.DayGrid = __ds_scope.DayGrid;

__ds_ns.HourGrid = __ds_scope.HourGrid;

__ds_ns.MonthHeatmap = __ds_scope.MonthHeatmap;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.TaskCard = __ds_scope.TaskCard;

__ds_ns.TimeHeatmap = __ds_scope.TimeHeatmap;

})();
