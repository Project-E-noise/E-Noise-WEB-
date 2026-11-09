// Page title row with optional buttons on the right.
export function Topbar({ title, subtitle, children }) {
  return (
    <div className="topbar">
      <div>
        <h1 className="pg-title">{title}</h1>
        {subtitle && <div className="pg-sub">{subtitle}</div>}
      </div>
      {children && <div className="topbar-right">{children}</div>}
    </div>
  );
}
