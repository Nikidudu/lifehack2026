# AI Commerce Readiness Backend

Stateless FastAPI backend for scoring product data, optional semantic evaluation, before/after comparison, content-generation integration, and shopping-query simulation.

Interactive API documentation: `http://127.0.0.1:8000/docs`

## Setup

Requires Python 3.12+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and configure only what you need:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_API_KEY` is required only for `/evaluate` and the optional portion of `/analyze`. Never commit `.env` or a real key.

## Start FastAPI

```powershell
python -m uvicorn app.main:app --reload
```

API base URL: `http://127.0.0.1:8000`

## Run tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests mock OpenAI and do not make real AI requests.

## Product JSON schema

Only `title` is required. Unknown fields and negative/non-finite prices are rejected.

```json
{
  "product_id": null,
  "title": "Required nonblank string",
  "brand": null,
  "category": null,
  "description": null,
  "specifications": {"attribute": "value"},
  "materials": [],
  "dimensions": null,
  "price": null,
  "currency": null,
  "availability": null,
  "use_cases": [
    {"name": "Scenario", "description": "Details", "conditions": []}
  ],
  "target_personas": [
    {"name": "Persona", "description": "Details", "priorities": [], "constraints": []}
  ],
  "comparisons": [
    {"alternative": "Alternative", "advantages": [], "disadvantages": [], "evidence": null}
  ],
  "claims": [
    {"claim": "Claim text", "evidence": null, "source": null}
  ],
  "constraints_handled": {
    "budget": [],
    "climate": [],
    "geography": [],
    "time": [],
    "compatibility": [],
    "accessibility": [],
    "other": {}
  },
  "narrative": null
}
```

`dimensions` accepts either free text or a string-to-string object. Collections default to empty arrays/objects.

Complete fixtures are available in `examples/`.

## Endpoints

### Batch catalog workflow

- `POST /api/v1/catalog/import` accepts a SQLite file as multipart field `database`. The MVP adapter supports the Lifeo `watches`/`collections`/`specs` schema and returns canonical Product objects without modifying the database.
- `POST /api/v1/suggest` accepts `{ "products": [Product, ...] }` (maximum 50) and returns unverified, per-field AI suggestions. Suggestions are not applied by the backend; the client must obtain user acceptance.

In the frontend, choose `lifeo.db`, click **Import database**, select products from the catalog dropdown, then click **Generate suggestions**. Review each field and click **Accept** only when wanted.

| Method | Path | Purpose | OpenAI required |
|---|---|---|---|
| GET | `/health` | Service health | No |
| GET | `/api/v1/schema` | Schema/scoring metadata | No |
| POST | `/api/v1/score` | Deterministic 0–100 score | No |
| POST | `/api/v1/evaluate` | Optional semantic LLM judge | Yes |
| POST | `/api/v1/analyze` | Deterministic score plus optional judge | Optional |
| POST | `/api/v1/compare` | Compare before/after deterministic scores | No |
| POST | `/api/v1/improve` | Grounded, fill-only semantic generation | Yes for generation |
| POST | `/api/v1/simulate` | Person D simulation boundary | No for placeholder |

### Health

```bash
curl http://127.0.0.1:8000/health
```

```json
{"status":"ok"}
```

### Schema metadata

```bash
curl http://127.0.0.1:8000/api/v1/schema
```

Returns schema/scoring versions, supported sections, dimension maximums, and the total maximum score.

### Deterministic score

```bash
curl -X POST http://127.0.0.1:8000/api/v1/score \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo Shoe","price":179,"currency":"SGD"}'
```

Abridged response shape:

```json
{
  "total_score": 7,
  "readiness_level": "Not AI-Ready",
  "dimensions": {
    "core_information": {
      "score": 7,
      "max_score": 20,
      "issues": ["brand is missing."],
      "suggestions": ["Identify the brand so agents can answer brand-specific intents and attribute claims correctly."]
    }
  },
  "missing_fields": ["brand"],
  "critical_issues": [],
  "top_recommendations": []
}
```

Actual responses contain all eight scoring dimensions. Scores are deterministic and dimension scores sum to `total_score`.

### Semantic evaluation

```bash
curl -X POST http://127.0.0.1:8000/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo Shoe"}'
```

Response fields: `semantic_score`, `grounding_score`, `specificity_score`, `reasoning_quality_score`, `unsupported_claims`, `strengths`, `weaknesses`, `recommendations`, and `confidence`.

### Combined analysis

```bash
curl -X POST http://127.0.0.1:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo Shoe"}'
```

```json
{
  "deterministic_score": {"total_score": 3, "readiness_level": "Not AI-Ready", "dimensions": {}, "missing_fields": [], "critical_issues": [], "top_recommendations": []},
  "llm_evaluation_available": false,
  "llm_evaluation": null
}
```

The deterministic result remains available when OpenAI is unavailable.

### Before/after comparison

```bash
curl -X POST http://127.0.0.1:8000/api/v1/compare \
  -H "Content-Type: application/json" \
  -d '{"before":{"title":"Demo Shoe"},"after":{"title":"Demo Shoe","category":"Running shoes"}}'
```

Response fields: `before_score`, `after_score`, `score_change`, `improved_dimensions`, `regressed_dimensions`, `newly_completed_fields`, and `remaining_issues`.

### PowerShell curl quoting

If inline JSON loses its quotes in PowerShell, pipe it through stdin:

```powershell
'{"title":"Demo Shoe"}' | curl.exe -X POST "http://127.0.0.1:8000/api/v1/score" -H "Content-Type: application/json" --data-binary "@-"
```

## Integration for Person B

Endpoint: `POST /api/v1/improve`

Request:

```json
{
  "product": {"title": "Demo Shoe"},
  "score": {
    "total_score": 3,
    "readiness_level": "Not AI-Ready",
    "dimensions": {},
    "missing_fields": [],
    "critical_issues": [],
    "top_recommendations": []
  }
}
```

Response:

```json
{
  "original_product": {"title": "Demo Shoe"},
  "improved_product": {"title": "Demo Shoe", "narrative": "Generated only from supplied facts."},
  "generated_fields": ["narrative"],
  "warnings": ["AI-generated semantic fields require review against source catalog data."]
}
```

The implementation is located at:

```text
app/services/generation.py → improve_product(request)
```

Rules:

- Consume `request.product` as a validated `Product` object.
- Use `request.score` to identify gaps; do not recalculate or mutate it.
- Return both the unchanged original and a new validated `Product`.
- Generate only missing `description`, `use_cases`, `target_personas`, `constraints_handled`, and `narrative` fields.
- Populated fields cannot be overwritten.
- List every changed field in `generated_fields`; undeclared changes fail validation.
- Never invent evidence or silently convert unsupported claims into supported claims.

Without `OPENAI_API_KEY`, or if generation fails, the product is returned unchanged with a safe warning.

## Integration for Person C

Frontend endpoints:

- `/health` — startup/status check
- `/api/v1/schema` — supported sections and scoring weights
- `/api/v1/score` — fast deterministic dashboard result
- `/api/v1/analyze` — deterministic result plus optional semantic evaluation
- `/api/v1/compare` — before/after score and dimension changes

Use `/score` for the dependable baseline. In `/analyze`, check `llm_evaluation_available` before rendering `llm_evaluation`.

## Integration for Person D

Endpoint: `POST /api/v1/simulate`

```bash
curl -X POST http://127.0.0.1:8000/api/v1/simulate \
  -H "Content-Type: application/json" \
  -d '{"product":{"title":"Demo Shoe"},"queries":["Lightweight shoes under S$200 for humid weather"]}'
```

Response contract:

```json
{
  "product_id": null,
  "total_queries": 1,
  "matched_queries": 0,
  "match_rate": 0.0,
  "results": [
    {
      "query": "Lightweight shoes under S$200 for humid weather",
      "matched": false,
      "confidence": 0.0,
      "reasoning": "Simulation is not configured.",
      "matched_attributes": [],
      "missing_information": ["No simulation implementation is configured."]
    }
  ]
}
```

Connect the implementation by replacing the body of:

```text
app/services/simulation.py → simulate_queries(request)
```

Consume the validated `request.product` and `request.queries`. Return one result per query. `total_queries`, `matched_queries`, and `match_rate` are contract-validated against `results`. Reason only from supplied product data and list missing information instead of inventing facts.

## Error responses

Validation failures return HTTP 422:

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "title"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

Unavailable LLM evaluation returns HTTP 503 without raw SDK details:

```json
{"detail":"LLM evaluation unavailable"}
```

Unexpected server failures return HTTP 500:

```json
{"detail":"Internal server error"}
```
