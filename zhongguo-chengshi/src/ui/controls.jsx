// 面板控件：滑块、下拉、开关。数值格式化统一放这里，免得每个控件各写一套。
import { useState } from 'react';

function formatValue(control, value) {
  if (control.percent) return `${Math.round(value * 100)}%`;
  if (control.multiplier) return `${value.toFixed(2)}×`;
  if (control.count) return `${Math.round(value)}`;
  if (control.unit) return `${Math.round(value)}${control.unit}`;
  return typeof value === 'number' ? value.toFixed(2) : String(value);
}

export function Slider({ control, value, onChange }) {
  const pct = ((value - control.min) / (control.max - control.min)) * 100;
  return (
    <label className="ctl ctl-slider">
      <span className="ctl-head">
        <span className="ctl-label">{control.label}</span>
        <span className="ctl-value">{formatValue(control, value)}</span>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={control.label}
        style={{ '--fill': `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Select({ control, value, onChange }) {
  return (
    <label className="ctl ctl-select">
      <span className="ctl-label">{control.label}</span>
      <span className="select-wrap">
        <select value={value} aria-label={control.label} onChange={(e) => onChange(e.target.value)}>
          {control.options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
        <span className="select-caret" aria-hidden="true">▾</span>
      </span>
    </label>
  );
}

export function Toggle({ control, value, onChange }) {
  return (
    <label className="ctl ctl-toggle">
      <span className="ctl-label">{control.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={control.label}
        className={`switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="knob" />
      </button>
    </label>
  );
}

export function Control({ control, value, onChange }) {
  if (control.type === 'select') return <Select control={control} value={value} onChange={onChange} />;
  if (control.type === 'toggle') return <Toggle control={control} value={value} onChange={onChange} />;
  return <Slider control={control} value={value} onChange={onChange} />;
}

export function Group({ group, params, onChange, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`group ${open ? 'open' : ''}`}>
      <button type="button" className="group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="group-name">{group.name}</span>
        <span className="group-caret" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="group-body">
          {group.controls.map((control) => (
            <Control
              key={control.key}
              control={control}
              value={params[control.key]}
              onChange={(v) => onChange(control.key, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
