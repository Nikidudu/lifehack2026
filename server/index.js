import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { createSession, getSession } from "./lib/sessions.js";
import {
  detectProductTable,
  inspectChosenTable,
  readProducts,
} from "./lib/detect.js";
import {
  createEnrichedCopy,
  setAttribute,
  setProductTypes,
  getTypeCounts,
  getProgress,
  countAssignments,
  getUnassignedProducts,
} from "./lib/enrich.js";
import { classifyProductTypes, generateTaxonomy } from "./lib/openaiClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function sessionSummary(s) {
  return {
    sessionId: s.id,
    originalName: s.originalName,
    table: s.detection.table,
    columns: s.detection.columns,
    rowCount: s.detection.rowCount,
  };
}

function finalizeSession(session, detection) {
  session.detection = detection;
  session.db = createEnrichedCopy(session.originalPath, session.enrichedPath);
}

// --- upload ----------------------------------------------------------------
app.post(
  "/api/upload",
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) {
      throw Object.assign(new Error("No file uploaded."), { status: 400 });
    }
    const originalPath = req.file.path;
    let probe;
    let result;
    try {
      probe = new Database(originalPath, { readonly: true, fileMustExist: true });
      result = detectProductTable(probe);
    } catch (err) {
      if (probe) probe.close();
      fs.unlinkSync(originalPath);
      if (err.status) throw err;
      throw Object.assign(
        new Error("That file doesn't look like a valid SQLite database."),
        { status: 400 }
      );
    }
    probe.close();

    const session = createSession({
      originalPath,
      enrichedPath: `${originalPath}-enriched.db`,
      originalName: req.file.originalname || "catalog.db",
      detection: null,
      db: null,
      types: [],
      taxonomy: {},
    });

    if (result.needsTableChoice) {
      session.candidates = result.candidates;
      return res.json({
        sessionId: session.id,
        needsTableChoice: true,
        candidates: result.candidates,
      });
    }

    finalizeSession(session, result.detection);
    res.json(sessionSummary(session));
  })
);

app.post(
  "/api/choose-table",
  wrap(async (req, res) => {
    const session = getSession(req.body.sessionId);
    if (session.db) {
      throw Object.assign(new Error("Table already chosen."), { status: 400 });
    }
    const probe = new Database(session.originalPath, { readonly: true });
    let detection;
    try {
      detection = inspectChosenTable(probe, req.body.table);
    } finally {
      probe.close();
    }
    finalizeSession(session, detection);
    res.json(sessionSummary(session));
  })
);

// --- AI steps --------------------------------------------------------------
app.post(
  "/api/classify",
  wrap(async (req, res) => {
    const session = getSession(req.body.sessionId);
    const products = readProducts(session.db, session.detection, 500);

    let assignments;
    const withCategory = products.filter((p) => p.category != null && String(p.category).trim());
    const distinct = new Set(withCategory.map((p) => String(p.category).trim().toLowerCase()));

    if (withCategory.length === products.length && distinct.size > 0 && distinct.size <= 15) {
      // Existing category column is already a clean type — no AI call needed.
      assignments = products.map((p) => ({
        id: p.id,
        product_type: String(p.category).trim().toLowerCase(),
      }));
    } else {
      assignments = await classifyProductTypes(products);
    }

    setProductTypes(session.db, assignments);
    session.types = getTypeCounts(session.db);
    res.json({ types: session.types });
  })
);

app.post(
  "/api/taxonomy",
  wrap(async (req, res) => {
    const session = getSession(req.body.sessionId);
    if (!session.types.length) {
      throw Object.assign(new Error("Run classification first."), { status: 400 });
    }
    const products = readProducts(session.db, session.detection, 500);
    const typeRows = session.db
      .prepare(
        `SELECT product_id, value FROM product_attributes WHERE attribute = 'product_type'`
      )
      .all();
    const typeById = new Map(typeRows.map((r) => [r.product_id, r.value]));

    const entries = await Promise.all(
      session.types.map(async ({ name: type }) => {
        const sampleNames = products
          .filter((p) => typeById.get(p.id) === type)
          .map((p) => p.name);
        return [type, await generateTaxonomy(type, sampleNames)];
      })
    );
    session.taxonomy = Object.fromEntries(entries);
    res.json({ taxonomy: session.taxonomy, mock: process.env.MOCK_AI === "1" });
  })
);

// --- work queue & assignments ---------------------------------------------
app.get(
  "/api/products",
  wrap(async (req, res) => {
    const session = getSession(req.query.sessionId);
    const { type, attribute } = req.query;
    if (!type || !attribute) {
      throw Object.assign(new Error("type and attribute are required."), { status: 400 });
    }
    res.json({
      products: getUnassignedProducts(session.db, session.detection, type, attribute),
    });
  })
);

app.post(
  "/api/assign",
  wrap(async (req, res) => {
    const session = getSession(req.body.sessionId);
    const { productId, attribute, value } = req.body;
    if (!productId || !attribute || !value) {
      throw Object.assign(new Error("productId, attribute and value are required."), {
        status: 400,
      });
    }
    setAttribute(session.db, productId, attribute, value);
    res.json({ ok: true, totalAssignments: countAssignments(session.db) });
  })
);

app.get(
  "/api/state",
  wrap(async (req, res) => {
    const session = getSession(req.query.sessionId);
    res.json({
      ...sessionSummary(session),
      types: session.types,
      taxonomy: session.taxonomy,
      progress: getProgress(session.db),
      totalAssignments: countAssignments(session.db),
      mock: process.env.MOCK_AI === "1",
    });
  })
);

app.get(
  "/api/download",
  wrap(async (req, res) => {
    const session = getSession(req.query.sessionId);
    const base = session.originalName.replace(/\.(db|sqlite|sqlite3)$/i, "");
    res.download(session.enrichedPath, `${base}-enriched.db`);
  })
);

// --- errors ----------------------------------------------------------------
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Catalog Enricher API on :${PORT}`));
