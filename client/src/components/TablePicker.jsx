export default function TablePicker({ candidates, onChoose }) {
  return (
    <div className="table-picker">
      <h2>Which table holds your products?</h2>
      <p>We found several candidates — pick the right one.</p>
      <div className="table-cards">
        {candidates.map((c) => (
          <button
            key={c.table}
            className="table-card"
            onClick={() => onChoose(c.table)}
          >
            <div className="table-name">{c.table}</div>
            <div className="table-meta">{c.rowCount} rows</div>
            <div className="table-cols">
              {Object.entries(c.columns)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <span key={k} className="chip">
                    {k}: {v}
                  </span>
                ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
