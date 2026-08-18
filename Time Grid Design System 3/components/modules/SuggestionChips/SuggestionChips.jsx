import React from 'react';

const GROUPS = [
  { key: 'recent', label: '最近' },
  { key: 'tasks', label: '任务' },
  { key: 'routines', label: '流程' },
];

export function SuggestionChips(props) {
  const { recent = [], tasks = [], routines = [], onPick } = props;
  const data = { recent: recent.slice(0, 3), tasks: tasks.slice(0, 2), routines: routines.slice(0, 2) };
  const groups = GROUPS.filter((g) => data[g.key].length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="tg-chip-groups">
      {groups.map((g) => (
        <div className="tg-chip-group" key={g.key}>
          <span className="tg-chip-group-label">{g.label}</span>
          {data[g.key].map((name, i) => (
            <button key={i} type="button" className="tg-chip" onClick={() => onPick && onPick(name)}>{name}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
