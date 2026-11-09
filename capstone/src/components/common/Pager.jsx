// Previous / Next paging for lists that come from the API in pages.
export function Pager({ total, offset, count, pageSize, onPage, label = "records" }) {
  const page = Math.floor(offset / pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-count">{total} {label}</span>
      <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page + 1} of {pages}</span>
      <button type="button" className="btn btn-sm" disabled={offset + count >= total} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
