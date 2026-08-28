# AI Commerce Readiness Backend — Session Handoff

## Project goal

Build a stateless backend for a 24-hour Rezolve AI hackathon using this flow:

**Input → Score → Fix → Re-score → Prove improvement**

The backend evaluates whether vendor product data contains enough grounded, structured information for an AI shopping agent to match it to user intent and explain recommendations.

Person A owns backend architecture, schema, API contracts, deterministic scoring, optional LLM judging, validation, integration, and tests.

## Technology and constraints

- Python 3.12+
- FastAPI
- Pydantic v2
- Official OpenAI Python SDK
- pytest and FastAPI TestClient
- python-dotenv
- uvicorn
- Stateless MVP
- No database, Redis, Docker, authentication, queues, or ORM
- Deterministic scoring must work without OpenAI
- The system must never invent product facts

## Current backend structure

```text
backend/
├── .env.example
├── .gitignore
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── product.py
│   │   ├── readiness_judge.py
│   │   └── scoring.py
│   ├── prompts/
│   │   ├── __init__.py
│   │   └── readiness_judge.py
│   └── services/
│       ├── __init__.py
│       ├── llm_judge.py
│       └── scoring.py
├── examples/
│   ├── sample_product_minimal.json
│   └── sample_product_complete.json
└── tests/
    ├── test_health.py
    ├── test_llm_judge.py
    ├── test_product.py
    ├── test_readiness_judge.py
    ├── test_score_api.py
    └── test_scoring.py
```

The original repository also contains `rezolve-hackathon-brief.md` and a stale root-level compiled Flask artifact under `__pycache__`. The artifact is unrelated to the implemented FastAPI backend and was left untouched.

## FastAPI application

Implemented in `backend/app/main.py`.

- Loads `backend/.env` with `override=False`
- Configures local-development CORS
- Defaults to allowing:
  - `http://localhost:3000`
  - `http://localhost:5173`
- Registers the versioned API router
- Preserves `GET /health`
- Has a generic exception handler returning only:

```json
{"detail": "Internal server error"}
```

No stack traces, environment values, or internal exception messages are returned to clients.

## API endpoints

### `GET /health`

Response:

```json
{"status": "ok"}
```

### `POST /api/v1/score`

- Request body: canonical `Product`
- Response model: `ScoringResult`
- Uses normal FastAPI/Pydantic validation
- Invalid products return HTTP 422
- Endpoint is thin and delegates to `app.services.scoring.score_product`
- It never invokes OpenAI

### `GET /api/v1/schema`

Returns:

- `schema_version`
- `scoring_version`
- supported product sections
- scoring dimensions and maximum points
- total maximum score

Scoring weights come directly from `DIMENSION_MAX_SCORES`; the endpoint does not duplicate them.

Current schema and scoring versions are both `1.0.0`.

## Canonical Product contract

Only `title` is required at the product level, and it cannot be blank.

```json
{
  "product_id": null,
  "title": "Required non-blank string",
  "brand": null,
  "category": null,
  "description": null,
  "specifications": {},
  "materials": [],
  "dimensions": null,
  "price": null,
  "currency": null,
  "availability": null,
  "use_cases": [
    {
      "name": "Required string",
      "description": "Required string",
      "conditions": []
    }
  ],
  "target_personas": [
    {
      "name": "Required string",
      "description": "Required string",
      "priorities": [],
      "constraints": []
    }
  ],
  "comparisons": [
    {
      "alternative": "Required string",
      "advantages": [],
      "disadvantages": [],
      "evidence": null
    }
  ],
  "claims": [
    {
      "claim": "Required string",
      "evidence": null,
      "source": null
    }
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

Important schema behavior:

- Collections use safe independent default factories
- `dimensions` accepts free text or a string-to-string object
- Price must be finite and non-negative
- Arbitrary product categories remain supported
- Models forbid unknown fields
- Unsupported claims remain distinguishable because evidence and source are separate optional fields

## Deterministic scoring

Implemented in `backend/app/services/scoring.py`.

It contains independent functions for every dimension and makes no external calls. Duplicate strings are counted once case-insensitively, blank content receives no credit, and no facts are inferred from prose.

| Dimension | Maximum |
|---|---:|
| Core information | 20 |
| Structured attributes | 15 |
| Use-case coverage | 15 |
| Persona coverage | 12 |
| Comparison information | 10 |
| Claims and evidence | 15 |
| Constraint coverage | 10 |
| Storytelling/context | 3 |
| **Total** | **100** |

Readiness bands:

- 0–39: `Not AI-Ready`
- 40–59: `Developing`
- 60–79: `AI-Ready with Gaps`
- 80–100: `Highly AI-Ready`

The structured result contains:

```json
{
  "total_score": 72,
  "readiness_level": "AI-Ready with Gaps",
  "dimensions": {
    "core_information": {
      "score": 18,
      "max_score": 20,
      "issues": [],
      "suggestions": []
    }
  },
  "missing_fields": [],
  "critical_issues": [],
  "top_recommendations": []
}
```

Unsupported claims receive one point for the recorded claim but no evidence/source credit. They are explicitly added to claim issues and `critical_issues`.

Recommendations are selected deterministically from dimensions with the largest proportional gaps. Dimension scores always add exactly to the total.

## Optional LLM readiness judge

The LLM judge is isolated in `backend/app/services/llm_judge.py`. It is not connected to the deterministic scoring endpoint.

Its purpose is to judge semantic properties that deterministic completeness rules cannot assess:

- specificity
- recommendation usefulness
- meaningful use cases and personas
- useful comparisons
- unsupported claims
- natural-language shopping-intent context

Structured output model:

```json
{
  "semantic_score": 0,
  "grounding_score": 0,
  "specificity_score": 0,
  "reasoning_quality_score": 0,
  "unsupported_claims": [],
  "strengths": [],
  "weaknesses": [],
  "recommendations": [],
  "confidence": 0.0
}
```

Validation rules:

- Four scores are integers from 0 through 100
- Confidence is from 0 through 1
- Extra output fields are forbidden
- Result is parsed using the Pydantic model through `client.responses.parse`

LLM safety rules are encoded in `backend/app/prompts/readiness_judge.py`:

- Judge only; never generate product content
- Evaluate only supplied Product JSON
- No outside brand, category, competitor, or product knowledge
- Never infer missing facts
- Explicitly report absent evidence
- Do not reward length by itself
- Recommendations describe information types, not invented answers

OpenAI configuration:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

- API key comes only from `OPENAI_API_KEY`
- Default model is `gpt-4o-mini`
- Temperature is `0`
- Client and per-request timeout are 20 seconds
- Client has one retry
- API keys and environment variables are never placed in prompts or request content
- The service only sends the judge system prompt and validated Product JSON

Safe domain errors:

- `LLMJudgeConfigurationError`
- `LLMJudgeResponseError`
- `LLMJudgeUnavailableError`

Timeouts, authentication failures, general API failures, and malformed structured results are converted to these errors. A failed judge call does not affect deterministic scoring.

No API endpoint currently invokes the LLM judge.

## Environment and security

`backend/.gitignore` ignores:

- `.env`
- `.env.*` except `.env.example`
- `.venv/`
- Python caches
- pytest cache

Never add a real API key to `.env.example` or source code.

## Dependencies

Declared in `backend/requirements.txt`:

- `fastapi`
- `httpx`
- `openai`
- `python-dotenv`
- `pytest`
- `uvicorn`

The local environment used during development is `backend/.venv` with Python 3.14.5 and OpenAI SDK 3.6.0.

## Running locally

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Useful URLs:

- Health: `http://127.0.0.1:8000/health`
- Schema metadata: `http://127.0.0.1:8000/api/v1/schema`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

PowerShell-safe manual score request:

```powershell
'{"title":"Minimal product"}' | curl.exe -X POST "http://127.0.0.1:8000/api/v1/score" -H "Content-Type: application/json" --data-binary "@-"
```

PowerShell-native equivalent:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/v1/score" -ContentType "application/json" -Body (@{ title = "Minimal product" } | ConvertTo-Json)
```

## Tests

Run from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Latest result:

```text
51 passed
```

Tests cover:

- Health endpoint
- Product validation and JSON round-tripping
- Minimal, sparse, and maximum deterministic scores
- All scoring dimensions
- Unsupported and supported claims
- Score bounds and arithmetic
- Repeated deterministic scoring
- Score API validation and repeatability
- Safe internal-error responses
- Schema metadata endpoint
- Judge output validation and prompt guardrails
- Mocked OpenAI success, malformed output, timeout, authentication failure, API failure, and missing key
- Deterministic scoring after an LLM failure

No test makes a real OpenAI request.

## Current stopping point

The backend currently has:

1. A canonical shared Product model
2. A complete deterministic 0–100 scorer
3. A working score endpoint
4. A schema metadata endpoint
5. An optional isolated OpenAI judge service with mocked tests

Potential next work should be explicitly requested. Likely integration choices include exposing the optional judge through a separate endpoint, combining deterministic and semantic results, or coordinating contracts with the generation and simulation teammates. Do not make `/api/v1/score` depend on OpenAI.
