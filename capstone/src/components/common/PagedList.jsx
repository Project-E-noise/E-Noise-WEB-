import { useState } from "react";
import { useAsync } from "../../hooks/useAsync";
import { DateRangeFilter } from "./DateRangeFilter";
import { DataTable } from "./DataTable";
import { Pager } from "./Pager";
import { AsyncSection } from "./UiStates";

const PAGE_SIZE = 20;

// Date-filtered, paged list used by the client Logs and Violations pages.
// fetchPage({ from, to, limit, offset }) must return { items, total }.
export function PagedList({ fetchPage, columns, rowKey, emptyTitle, loadingLabel, label }) {
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [page, setPage] = useState(0);
  const query = useAsync(
    () => fetchPage({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [filters.from, filters.to, page]
  );

  const applyFilters = next => {
    setFilters(next);
    setPage(0);
  };

  return (
    <div className="card card-flush">
      <div className="card-section">
        <DateRangeFilter value={filters} onApply={applyFilters} />
      </div>
      <AsyncSection
        loading={query.loading}
        error={query.error}
        data={query.data}
        isEmpty={d => !d.items.length}
        onRetry={query.reload}
        loadingLabel={loadingLabel}
        emptyProps={{ icon: "ti-list-search", title: emptyTitle, subtitle: filters.from || filters.to ? "Try a different date range." : undefined }}
      >
        {data => (
          <>
            <DataTable columns={columns} rows={data.items} rowKey={rowKey} caption={label} />
            <div className="card-footer">
              <Pager total={data.total} offset={page * PAGE_SIZE} count={data.items.length} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
          </>
        )}
      </AsyncSection>
    </div>
  );
}
