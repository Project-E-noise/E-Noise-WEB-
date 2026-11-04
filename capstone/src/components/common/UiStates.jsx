export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="empty">
      <i className="ti ti-loader-2 spin" />
      <div className="empty-title">{label}</div>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="empty empty-error">
      <i className="ti ti-alert-triangle" />
      <div className="empty-title">Couldn't load this data</div>
      <div className="empty-sub">{message}</div>
      {onRetry && (
        <button className="btn btn-primary retry-btn" onClick={onRetry}>
          <i className="ti ti-refresh" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = "ti-inbox", title = "Nothing here yet", subtitle, action }) {
  return (
    <div className="empty">
      <i className={`ti ${icon}`} />
      <div className="empty-title">{title}</div>
      {subtitle && <div className="empty-sub">{subtitle}</div>}
      {action}
    </div>
  );
}

// Wraps a useAsync-style {loading, error, data} result and renders the right
// state automatically, so pages don't repeat this branching everywhere.
export function AsyncSection({ loading, error, data, isEmpty, onRetry, loadingLabel, emptyProps, children }) {
  if (loading) return <LoadingState label={loadingLabel} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (isEmpty ? isEmpty(data) : !data) return <EmptyState {...emptyProps} />;
  return children(data);
}
