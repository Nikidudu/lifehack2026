# Catalog Enricher

Make your product catalog legible to AI assistants. Brands upload their SQLite
`.db` catalog; the app identifies product types, has OpenAI propose the missing
**category vocabulary** for each type (e.g. shoes → setting: formal / casual /
sports), and a human drags each product into the right box. AI proposes the
taxonomy, **humans supply the facts** — so the enriched data contains zero
hallucinated product attributes.

The result is a copy of the original database with one new table:

```sql
product_attributes (product_id TEXT, attribute TEXT, value TEXT)
-- e.g. (42, 'setting', 'formal'), (42, 'product_type', 'shoes')
```

Original tables are never modified.

## Stack

- `client/` — Vite + React + @dnd-kit (drag-and-drop UI)
- `server/` — Express + better-sqlite3 + OpenAI SDK (structured outputs)

## Setup

Requires Node 20+ (`~/.local/opt/node22/bin` on this machine — add it to PATH).

```bash
npm run install:all              # root + server + client deps
cp server/.env.example server/.env   # then put your OPENAI_API_KEY inside
node sample/make-sample-db.js    # optional: build sample/catalog.db demo data
npm run dev                      # server on :3001, client on :5173
```

Open http://localhost:5173 and drop `sample/catalog.db` (or any SQLite file).

### No API key? Mock mode

Set `MOCK_AI=1` in `server/.env` to run the whole flow with canned
classification/taxonomies (tuned to the sample catalog) — useful for UI demos
without spending credits.

## How it works

1. **Upload** — the server scans every table, scores which one looks like a
   product catalog (name/description/price/category columns), and maps columns
   automatically. Ambiguous databases get a manual table picker.
2. **Classify** — products are batched to OpenAI to assign a coarse
   `product_type` (shoes, watches, …). If the table already has a clean
   category column, it's used directly and no AI call is made.
3. **Taxonomy** — for each product type, OpenAI proposes 3–5 attribute
   categories, each either *single-choice* with exactly 3 values (the three
   drop boxes) or *binary* (yes/no). Strict JSON-schema outputs keep the shape
   honest.
4. **Human categorization** — products that lack a value for the current
   attribute appear one at a time; drag the card into a box (or click it, or
   press 1/2/3; Space/S skips). Every drop is written to
   `product_attributes` immediately.
5. **Export** — download the enriched `.db` at any point.

## Ideas / stretch

- `multi-choice` attributes (chip toggles + confirm)
- numeric-range attributes (slider)
- re-editing past assignments, undo
- persist sessions to disk so a server restart doesn't lose work
