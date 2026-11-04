export function Input({ label, type = "text", value, onChange, placeholder, required, hint, disabled }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input
        className="form-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

export function Select({ label, value, onChange, options, hint }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(option => {
          const opt = typeof option === "object" ? option : { value: option, label: option };
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

export function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea className="form-textarea" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Slider({ label, min, max, value, onChange, hint, unit = "dB" }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div className="slider-wrap">
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(e.target.value)} />
        <span className="slider-val">
          {value} {unit}
        </span>
      </div>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}
