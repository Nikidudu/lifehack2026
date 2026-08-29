# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 24-hour Rezolve AI hackathon project. It scores whether a vendor's product data contains
enough grounded, structured information for an AI shopping agent to match it to a
natural-language shopping intent *and explain the match*. The demo loop is
**input → score → fix → re-score → prove improvement**.

Two docs carry the intent and must be treated as the source of truth for scope:

- `SESSION_HANDOFF.md` — backend contracts, scoring rubric, what is deliberately not built yet.
- `rezolve-hackathon-brief.md` — problem framing, team split (A backend / B generation / C frontend / D simulation), pitch angle.

Two rules run through the whole codebase:

1. **The system never invents product facts.** Scoring, prompts, and UI copy describe what
   *type* of information is missing; they never supply the missing fact.
2. **Deterministic scoring must work without OpenAI.** `POST /api/v1/score` must never
   depend on a model call.

## Commands

Backend (from `backend/`):

```bash
python -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m uvicorn app.main:app --reload        # http://127.0.0.1:8000
./.venv/bin/python -m pytest                               # 51 tests, all offline
./.venv/bin/python -m pytest tests/test_scoring.py::test_complete_product_scores_one_hundred -q
```

Frontend (from repo root, no build step, no Node required):

```bash
python3 frontend/serve.py                                  # http://localhost:5173
```

Environment quirks on this machine, both of which will bite:

- `/opt/ros/jazzy` is on `PYTHONPATH` and its pytest plugins break collection with
  `ModuleNotFoundError: No module named 'yaml'`. Run tests as
  `env -u PYTHONPATH ./.venv/bin/python -m pytest`.
- Port 8000 is often occupied by an unrelated local project. Use
  `--port 8001` and set the frontend's **API base** field (or `?api=http://127.0.0.1:8001`).

`python -m pytest` (not bare `pytest`) matters: there is no `pyproject.toml`, `conftest.py`,
or `pytest.ini`, so `app` is importable only because `-m` puts the working directory on
`sys.path`. Tests must be run from `backend/`.

## Backend architecture (`backend/`)

FastAPI + Pydantic v2, stateless. No database, ORM, auth, queue, or Docker — deliberately.

**One canonical contract.** `app/models/product.py` defines `Product`, the shared schema
every track codes against. Only `title` is required (and cannot be blank); every model sets
`extra="forbid"`, so any producer sending a stray key gets HTTP 422. Collections use
independent default factories, `dimensions` accepts free text *or* a name→value object, and
`Claim.evidence` / `Claim.source` are separate optional fields specifically so unsupported
claims stay detectable.

**Scoring weights have a single home.** `DIMENSION_MAX_SCORES` in `app/services/scoring.py`
is the only place dimension maxima exist. `GET /api/v1/schema` derives its response from that
dict, and the frontend derives its layout from the response — so a weight change propagates
everywhere without a second edit. Do not restate the weights anywhere.

**Scoring shape.** Each dimension has an independent `score_*(product) -> DimensionEvaluation`
function (a `DimensionScore` plus `missing_fields` and `critical_issues` it contributes).
`score_product` runs all eight, sums them, dedupes the collected fields/issues, and picks the
top five recommendations from the dimensions with the largest *proportional* gap. Invariants
the tests enforce: dimension scores always sum to the total, duplicate strings count once
(case-insensitively), blank content earns nothing, nothing is inferred from prose, and the
same product always scores identically. A claim with no evidence earns its 1 point for being
recorded and is promoted to `critical_issues`.

Bands: 0–39 `Not AI-Ready`, 40–59 `Developing`, 60–79 `AI-Ready with Gaps`, 80–100 `Highly AI-Ready`.

**The LLM judge is isolated on purpose.** `app/services/llm_judge.py` judges semantic
properties the deterministic rules cannot (specificity, grounding, reasoning quality). It is
reachable from no endpoint. It accepts an injected client (that is how every test mocks it),
converts every SDK failure into `LLMJudgeConfigurationError` / `LLMJudgeResponseError` /
`LLMJudgeUnavailableError`, and parses output through `ReadinessJudgeResult` via
`client.responses.parse`. Its guardrails live in `app/prompts/readiness_judge.py`: judge only,
evaluate only the supplied JSON, no outside knowledge, never infer missing facts, recommend
information *types*. Only the system prompt and validated product JSON are ever sent —
never environment values. Keep it that way, and keep failures from touching `/score`.

`app/main.py` loads `backend/.env` with `override=False`, reads `CORS_ORIGINS`
(default `localhost:3000,localhost:5173`), and installs a catch-all handler that returns
`{"detail": "Internal server error"}` — no stack traces or internals reach a client.

## Frontend architecture (`frontend/`)

Zero-build ES modules served as static files — there is no Node toolchain on this machine and
no `package.json`; keep it dependency-free. See `frontend/README.md` for the demo script.

The pivotal boundary is in `js/product.js`: the editor holds a **draft** whose scalars are
always strings (blank = "not provided"), and `toPayload()` is the *only* place that builds a
request body — necessary because the backend forbids unknown fields and rejects blank titles.
`fromPayload()` goes the other way and drops non-schema keys with a warning.

`js/dashboard.js` renders score, breakdown, fix list, and the before/after proof. The first
successful score becomes the **baseline**; re-scoring after edits produces the proof view that
the pitch depends on. Recommendations and missing fields map back to editor sections through
`DIMENSION_SECTIONS` / `FIELD_SECTIONS`, which is what makes every finding clickable.

*Auto-fill gaps* calls `POST /api/v1/generate` — an endpoint that does not exist yet (the
generation track owns it). A 404 is surfaced as "not wired up"; the rest of the app keeps
working. If that endpoint lands, it may return a bare `Product` or `{"product": {...}}`.

Browsers treat `localhost` and `127.0.0.1` as different origins: open the console on
**http://localhost:5173** or CORS will block it.

## Working on this repo

- Adding a scoring dimension means editing `DIMENSION_MAX_SCORES`, adding a `score_*`
  function, registering it in `score_product`, and adding a label in the frontend's
  `DIMENSION_LABELS` / `DIMENSION_SECTIONS`. Nothing else should need to change.
- No test may make a real OpenAI request.
- `__pycache__/app.cpython-314.pyc` at the repo root is a stale artifact from an unrelated
  Flask app. It is not part of this project; leave it alone.
