import fs from "node:fs";
import Database from "better-sqlite3";
import { quoteIdent } from "./detect.js";

// Copy the upload and add the product_attributes table. All user assignments
// (and AI product-type classifications) live there; original tables untouched.
export function createEnrichedCopy(originalPath, enrichedPath) {
  fs.copyFileSync(originalPath, enrichedPath);
  const db = new Database(enrichedPath);
  db.pragma("journal_mode = DELETE"); // keep everything in the single .db file
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_attributes (
      product_id TEXT NOT NULL,
      attribute  TEXT NOT NULL,
      value      TEXT NOT NULL,
      PRIMARY KEY (product_id, attribute)
    );
  `);
  return db;
}

export function setAttribute(db, productId, attribute, value) {
  db.prepare(
    `INSERT OR REPLACE INTO product_attributes (product_id, attribute, value)
     VALUES (?, ?, ?)`
  ).run(String(productId), attribute, value);
}

export function setProductTypes(db, assignments) {
  const tx = db.transaction((rows) => {
    for (const { id, product_type } of rows) {
      setAttribute(db, id, "product_type", product_type);
    }
  });
  tx(assignments);
}

export function getTypeCounts(db) {
  return db
    .prepare(
      `SELECT value AS name, COUNT(*) AS count FROM product_attributes
       WHERE attribute = 'product_type' GROUP BY value ORDER BY count DESC`
    )
    .all();
}

// Assigned counts per (type, attribute) — powers the sidebar progress bars.
export function getProgress(db) {
  return db
    .prepare(
      `SELECT t.value AS type, a.attribute AS attribute, COUNT(*) AS assigned
       FROM product_attributes a
       JOIN product_attributes t
         ON t.product_id = a.product_id AND t.attribute = 'product_type'
       WHERE a.attribute != 'product_type'
       GROUP BY t.value, a.attribute`
    )
    .all();
}

export function countAssignments(db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM product_attributes WHERE attribute != 'product_type'`
    )
    .get().c;
}

// Products of `type` that don't yet have a value for `attribute`.
export function getUnassignedProducts(db, detection, type, attribute, limit = 300) {
  const { table, columns } = detection;
  const idExpr = columns.id ? `p.${quoteIdent(columns.id)}` : "p.rowid";
  const sel = [
    `CAST(${idExpr} AS TEXT) AS id`,
    `p.${quoteIdent(columns.name)} AS name`,
    columns.description
      ? `p.${quoteIdent(columns.description)} AS description`
      : "NULL AS description",
    columns.price ? `p.${quoteIdent(columns.price)} AS price` : "NULL AS price",
  ].join(", ");

  return db
    .prepare(
      `SELECT ${sel}
       FROM ${quoteIdent(table)} p
       JOIN product_attributes t
         ON t.product_id = CAST(${idExpr} AS TEXT)
        AND t.attribute = 'product_type' AND t.value = ?
       LEFT JOIN product_attributes a
         ON a.product_id = t.product_id AND a.attribute = ?
       WHERE a.product_id IS NULL
       LIMIT ?`
    )
    .all(type, attribute, limit);
}
