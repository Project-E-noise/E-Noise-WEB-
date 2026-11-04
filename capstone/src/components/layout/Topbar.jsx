export function Topbar({ title, subtitle, children }) {
  return (
    <div className="topbar">
      <div>
        <div className="pg-title">{title}</div>
        {subtitle && <div className="pg-sub">{subtitle}</div>}
      </div>
      {children && <div className="topbar-right">{children}</div>}
    </div>
  );
}
