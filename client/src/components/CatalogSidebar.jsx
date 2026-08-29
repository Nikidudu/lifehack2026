export default function CatalogSidebar({
  session,
  isMock,
  types,
  taxonomy,
  progress,
  current,
  totalAssignments,
  onSelect,
}) {
  return (
    <aside className="sidebar">
      <div className="logo small">
        Catalog<span>Enricher</span>
      </div>
      {isMock && (
        <div className="banner demo">
          <strong>Demo mode</strong> — these are canned example categories, not
          AI-generated ones. Put your OpenAI key in <code>server/.env</code>{" "}
          and set <code>MOCK_AI=0</code> to generate real categories for your
          catalog.
        </div>
      )}
      <div className="db-info">
        <div className="db-name">{session.originalName}</div>
        <div className="db-meta">
          table <code>{session.table}</code> · {session.rowCount} products
        </div>
      </div>

      <nav className="type-list">
        {types.map((t) => (
          <div key={t.name} className="type-block">
            <div className="type-head">
              <span className="type-name">{t.name}</span>
              <span className="type-count">{t.count}</span>
            </div>
            {(taxonomy[t.name] || []).map((attr, i) => {
              const done = progress[`${t.name}|${attr.name}`] || 0;
              const active =
                current && current.type === t.name && current.attrIndex === i;
              return (
                <button
                  key={attr.name}
                  className={`attr-row ${active ? "active" : ""}`}
                  onClick={() => onSelect(t.name, i)}
                >
                  <span className="attr-name">
                    {attr.name}
                    <span className="attr-kind">
                      {attr.kind === "binary" ? "yes / no" : attr.values.join(" · ")}
                    </span>
                  </span>
                  <span className="attr-progress">
                    <span className="bar">
                      <span
                        className="bar-fill"
                        style={{ width: `${Math.min(100, (done / t.count) * 100)}%` }}
                      />
                    </span>
                    <span className="bar-label">
                      {done}/{t.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="export-bar">
        <div className="export-count">
          <strong>{totalAssignments}</strong> attribute
          {totalAssignments === 1 ? "" : "s"} verified
        </div>
        <a
          className="btn primary block"
          href={`/api/download?sessionId=${session.sessionId}`}
        >
          Download enriched .db
        </a>
      </div>
    </aside>
  );
}
