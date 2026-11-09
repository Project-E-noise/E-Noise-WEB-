// A simple table used everywhere data is listed.
// columns: [{ key, label, render?: row => node, numeric?: bool }]
// On phones each row turns into a small card (see .stack-on-mobile in styles.css).
export function DataTable({ columns, rows, rowKey = row => row.id, caption }) {
  return (
    <div className="table-wrap">
      <table className="data-table stack-on-mobile">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} scope="col" className={col.numeric ? "num" : undefined}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map(col => (
                <td key={col.key} data-label={col.label} className={col.numeric ? "num" : undefined}>
                  {col.render ? col.render(row) : row[col.key] ?? "--"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
