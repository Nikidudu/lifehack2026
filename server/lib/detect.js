// Auto-detection of the product table and its interesting columns inside an
// arbitrary uploaded SQLite database.

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const NAME_RE = /^(name|title|product_?name|item_?name|product|item|label)$/i;
const NAME_LOOSE_RE = /(name|title)/i;
const DESC_RE = /(desc|description|summary|details|about)/i;
const PRICE_RE = /(price|cost|msrp|amount)/i;
const CATEGORY_RE = /^(category|type|kind|genre|class|department|segment)$/i;

function listUserTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'product_attributes'`
    )
    .all()
    .map((r) => r.name);
}

function inspectTable(db, table) {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  const rowCount = db
    .prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`)
    .get().c;

  const textish = (c) => !c.type || /char|text|clob|string/i.test(c.type);
  const numish = (c) => /int|real|num|dec|float|double|money/i.test(c.type || "");

  let nameCol =
    cols.find((c) => textish(c) && NAME_RE.test(c.name)) ||
    cols.find((c) => textish(c) && NAME_LOOSE_RE.test(c.name));
  const descCol = cols.find(
    (c) => textish(c) && c !== nameCol && DESC_RE.test(c.name)
  );
  const priceCol = cols.find((c) => numish(c) && PRICE_RE.test(c.name));
  const categoryCol = cols.find(
    (c) => textish(c) && c !== nameCol && CATEGORY_RE.test(c.name)
  );

  // Fallback: first text column that isn't description/category.
  if (!nameCol) {
    nameCol = cols.find(
      (c) => textish(c) && c.pk === 0 && c !== descCol && c !== categoryCol
    );
  }

  let score = 0;
  if (cols.find((c) => textish(c) && NAME_RE.test(c.name))) score += 3;
  else if (nameCol && NAME_LOOSE_RE.test(nameCol.name)) score += 2;
  else if (nameCol) score += 1;
  if (descCol) score += 2;
  if (priceCol) score += 2;
  if (categoryCol) score += 1;
  if (/product|item|catalog|inventory|sku/i.test(table)) score += 2;
  if (rowCount > 0) score += Math.min(rowCount, 100) / 100;

  const pkCols = cols.filter((c) => c.pk > 0);
  const idCol =
    pkCols.length === 1 && /int/i.test(pkCols[0].type || "")
      ? pkCols[0].name
      : null; // null → use rowid

  return {
    table,
    rowCount,
    score,
    columns: {
      id: idCol,
      name: nameCol ? nameCol.name : null,
      description: descCol ? descCol.name : null,
      price: priceCol ? priceCol.name : null,
      category: categoryCol ? categoryCol.name : null,
    },
    allColumns: cols.map((c) => c.name),
  };
}

// Returns { detection } when confident, or { needsTableChoice, candidates }.
export function detectProductTable(db) {
  const tables = listUserTables(db);
  if (tables.length === 0) {
    throw Object.assign(new Error("No tables found in this database."), {
      status: 400,
    });
  }

  const inspected = tables
    .map((t) => inspectTable(db, t))
    .filter((t) => t.rowCount > 0 && t.columns.name);

  if (inspected.length === 0) {
    throw Object.assign(
      new Error("No table with rows and a name-like text column was found."),
      { status: 400 }
    );
  }

  inspected.sort((a, b) => b.score - a.score);
  const [best, second] = inspected;

  const confident =
    best.score >= 4 && (!second || best.score - second.score >= 1);

  if (confident || inspected.length === 1) return { detection: best };

  return {
    needsTableChoice: true,
    candidates: inspected.map(({ table, rowCount, columns }) => ({
      table,
      rowCount,
      columns,
    })),
  };
}

export function inspectChosenTable(db, table) {
  const info = inspectTable(db, table);
  if (info.rowCount === 0 || !info.columns.name) {
    throw Object.assign(
      new Error(`Table "${table}" has no rows or no usable name column.`),
      { status: 400 }
    );
  }
  return info;
}

// Read products (id coerced to string) for classification / the work queue.
export function readProducts(db, detection, limit = 500) {
  const { table, columns } = detection;
  const idExpr = columns.id ? quoteIdent(columns.id) : "rowid";
  const sel = [
    `CAST(${idExpr} AS TEXT) AS id`,
    `${quoteIdent(columns.name)} AS name`,
    columns.description
      ? `${quoteIdent(columns.description)} AS description`
      : "NULL AS description",
    columns.price ? `${quoteIdent(columns.price)} AS price` : "NULL AS price",
    columns.category
      ? `${quoteIdent(columns.category)} AS category`
      : "NULL AS category",
  ].join(", ");
  return db
    .prepare(`SELECT ${sel} FROM ${quoteIdent(table)} LIMIT ?`)
    .all(limit);
}
