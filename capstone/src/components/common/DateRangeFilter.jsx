import { useState } from "react";
import { Input } from "./FormFields";

// From/To date pickers with Apply and Clear. Calls onApply({ from, to })
// with YYYY-MM-DD strings (or "" when cleared).
export function DateRangeFilter({ value, onApply }) {
  const [from, setFrom] = useState(value?.from || "");
  const [to, setTo] = useState(value?.to || "");
  const [error, setError] = useState("");

  const apply = event => {
    event.preventDefault();
    if (from && to && from > to) return setError("The start date must be on or before the end date.");
    setError("");
    onApply({ from, to });
  };
  const clear = () => {
    setFrom("");
    setTo("");
    setError("");
    onApply({ from: "", to: "" });
  };

  return (
    <form className="filter-bar" onSubmit={apply} noValidate>
      <Input label="From" type="date" value={from} onChange={setFrom} max={to || undefined} />
      <Input label="To" type="date" value={to} onChange={setTo} min={from || undefined} error={error} />
      <div className="row-inline">
        <button className="btn btn-primary" type="submit">Apply</button>
        <button className="btn" type="button" onClick={clear} disabled={!from && !to && !value?.from && !value?.to}>Clear</button>
      </div>
    </form>
  );
}
