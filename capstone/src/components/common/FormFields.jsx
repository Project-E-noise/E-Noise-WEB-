import { useId } from "react";

// Shared form controls. Each one has a label linked to the input (good for
// screen readers and for tapping the label on phones) and can show an
// error message under the field.

function Field({ id, label, hint, error, children }) {
  return (
    <div className="form-group">
      {label && <label className="form-label" htmlFor={id}>{label}</label>}
      {children}
      {error ? <small className="field-error" id={`${id}-error`}>{error}</small> : hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

export function Input({ label, hint, error, onChange, type = "text", ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className="form-input"
        type={type}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={e => onChange(e.target.value)}
        {...props}
      />
    </Field>
  );
}

export function Select({ label, hint, error, value, onChange, options, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select id={id} className="form-select" value={value} onChange={e => onChange(e.target.value)} aria-invalid={error ? "true" : undefined} {...props}>
        {options.map(option => {
          const opt = typeof option === "object" ? option : { value: option, label: option };
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, value, onChange, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea id={id} className="form-textarea" value={value} onChange={e => onChange(e.target.value)} {...props} />
    </Field>
  );
}

export function Slider({ label, hint, min, max, step = 1, value, onChange, unit = "dB" }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint}>
      <div className="slider-wrap">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
        <span className="slider-val">{value} {unit}</span>
      </div>
    </Field>
  );
}
