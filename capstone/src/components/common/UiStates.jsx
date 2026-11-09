// Loading, empty and error states used on every data page, so they all
// look and behave the same.

export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="state" role="status">
      <i className="ti ti-loader-2 spin" aria-hidden="true" />
      <div className="state-title">{label}</div>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <i className="ti ti-alert-triangle" aria-hidden="true" />
      <div className="state-title">Couldn't load this data</div>
      <div className="state-sub">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <i className="ti ti-refresh" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = "ti-inbox", title = "Nothing here yet", subtitle, action }) {
  return (
    <div className="state">
      <i className={`ti ${icon}`} aria-hidden="true" />
      <div className="state-title">{title}</div>
      {subtitle && <div className="state-sub">{subtitle}</div>}
      {action}
    </div>
  );
}

// Shows loading / error / empty / the content, depending on a useAsync result.
export function AsyncSection({ loading, error, data, isEmpty, onRetry, loadingLabel, emptyProps, children }) {
  if (loading && !data) return <LoadingState label={loadingLabel} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (isEmpty ? isEmpty(data) : !data) return <EmptyState {...emptyProps} />;
  return children(data);
}
