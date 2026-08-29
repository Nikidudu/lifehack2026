# Vendor console (frontend)

The UI for the hackathon loop: **input → score → fix → re-score → prove improvement**.
It is the human-facing half of the AI Commerce Readiness backend in `../backend`.

## Running it

Two processes, two terminals, from the repository root:

```bash
# 1. backend
cd backend
python -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m uvicorn app.main:app --reload          # http://127.0.0.1:8000

# 2. frontend
python3 frontend/serve.py                                     # http://localhost:5173
```

Open **http://localhost:5173** — not `file://`, and not `127.0.0.1:5173`. The backend's
CORS allowlist (`CORS_ORIGINS` in `backend/.env.example`) names `http://localhost:5173`
and `http://localhost:3000`, and a browser treats `localhost` and `127.0.0.1` as
different origins.

There is no build step, no `package.json`, and no runtime dependency: plain ES modules,
so any static server works (`python3 -m http.server 5173` from this directory is enough,
`serve.py` just adds no-cache headers).

If port 8000 is taken, run uvicorn elsewhere (`--port 8001`) and change **API base** in
the header — it is stored per browser.

### Deep links (useful on a demo machine)

| Query | Effect |
|---|---|
| `?api=http://127.0.0.1:8001` | Point the console at a different backend |
| `?sample=messy` | Preload a fixture (`messy`, `enriched`, `minimal`, `complete`) |
| `?score=1` | Score immediately after loading |

`http://localhost:5173/?sample=messy&score=1` opens straight onto the "before" screen.

## The demo path

1. **Messy vendor feed** → *Score product*. 20/100, `Not AI-Ready`, two critical issues
   (unsupported claims). This first score becomes the **baseline**.
2. **Fix list** tab — critical issues, the five ranked recommendations, and the missing
   fields. Every item jumps to the section of the editor that owns it.
3. Fix by hand, or press **Same product, enriched** to load the enrichment fixture (the
   generation track's job; see *Auto-fill gaps* below).
4. *Re-score* → 98/100, `Highly AI-Ready`, and the view switches to **Before / after**:
   +78 points, per-dimension movement, 13 fields filled, both critical issues resolved.

## How it maps to the backend

| UI | Backend |
|---|---|
| Header status dot | `GET /health` |
| `schema` / `scoring` / `max` chips, dimension order | `GET /api/v1/schema` |
| *Score product* | `POST /api/v1/score` |
| *Auto-fill gaps* | `POST /api/v1/generate` — **not implemented yet**; a 404 is reported as "not wired up", nothing else breaks |

Nothing in the UI hardcodes the rubric: dimension maxima, ordering, and the total come
from the score response and `/api/v1/schema`, so a scoring change in the backend shows up
here without a frontend edit. Band names come from `readiness_level`; only the four band
colours and their one-line explanations live in `js/dashboard.js`.

The console never invents product facts. It shows what the vendor supplied, what the
scorer found missing, and what *type* of information would close each gap.

## Files

| File | Role |
|---|---|
| `js/main.js` | State, persistence, wiring, the score/generate actions |
| `js/api.js` | Fetch wrapper; maps HTTP 422 to per-field messages, 404 to "not wired up" |
| `js/product.js` | Draft ⇄ canonical `Product` JSON, client-side validation, field→section maps |
| `js/form.js` | The structured editor (sections, chip lists, key/value rows, repeatable cards) |
| `js/dashboard.js` | Score ring, dimension breakdown, fix list, before/after proof |
| `js/samples.js` | Demo fixtures, including the messy/enriched pair used for the proof view |
| `js/dom.js` | `el` / `svg` / `mount` helpers |

The editor keeps a *draft* whose scalars are always strings (blank means "not provided");
`toPayload()` turns it into the canonical product JSON. The backend model forbids unknown
fields, so `toPayload` is the only place allowed to build a request body, and pasting
JSON with stray keys drops them with a warning rather than failing at the server.

State (API base, draft, last result, baseline) is kept in `localStorage` so a reload
mid-pitch does not lose the before/after story. Failures there are ignored.

## Known limits

- `POST /api/v1/generate` does not exist yet; *Auto-fill gaps* is a live client waiting
  for that endpoint. Until it lands, the "enriched" sample stands in for it.
- The optional LLM judge (`backend/app/services/llm_judge.py`) has no endpoint, so no
  semantic scores are shown. When one is exposed, it belongs beside the deterministic
  breakdown, not merged into it.
- The `enriched` fixture is written for the demo. It is illustrative content, not
  vendor-supplied fact.
