from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.models.readiness_judge import ReadinessJudgeResult
from app.services.llm_judge import LLMJudgeUnavailableError


client = TestClient(app)


def evaluation() -> ReadinessJudgeResult:
    return ReadinessJudgeResult(
        semantic_score=70,
        grounding_score=65,
        specificity_score=75,
        reasoning_quality_score=68,
        unsupported_claims=[],
        strengths=["Specific product attributes are provided."],
        weaknesses=["Comparison coverage is limited."],
        recommendations=["Provide evidence-backed comparisons."],
        confidence=0.8,
    )


def test_evaluate_returns_mocked_llm_result(monkeypatch) -> None:
    expected = evaluation()
    monkeypatch.setattr(
        routes.llm_judge_service,
        "evaluate_product_readiness",
        lambda product: expected,
    )

    response = client.post("/api/v1/evaluate", json={"title": "Product"})

    assert response.status_code == 200
    assert response.json() == expected.model_dump(mode="json")


def test_evaluate_returns_safe_503_when_llm_is_unavailable(monkeypatch) -> None:
    def unavailable(product) -> None:
        raise LLMJudgeUnavailableError("raw SDK error with secret details")

    monkeypatch.setattr(routes.llm_judge_service, "evaluate_product_readiness", unavailable)

    response = client.post("/api/v1/evaluate", json={"title": "Product"})

    assert response.status_code == 503
    assert response.json() == {"detail": "LLM evaluation unavailable"}
    assert "raw SDK error" not in response.text


def test_analyze_combines_deterministic_and_mocked_llm_results(monkeypatch) -> None:
    expected = evaluation()
    monkeypatch.setattr(
        routes.llm_judge_service,
        "evaluate_product_readiness",
        lambda product: expected,
    )

    response = client.post("/api/v1/analyze", json={"title": "Product"})

    assert response.status_code == 200
    body = response.json()
    assert body["deterministic_score"]["total_score"] == 3
    assert body["llm_evaluation_available"] is True
    assert body["llm_evaluation"] == expected.model_dump(mode="json")


def test_analyze_preserves_deterministic_result_when_llm_fails(monkeypatch) -> None:
    def unavailable(product) -> None:
        raise LLMJudgeUnavailableError("OpenAI is unavailable")

    monkeypatch.setattr(routes.llm_judge_service, "evaluate_product_readiness", unavailable)

    response = client.post("/api/v1/analyze", json={"title": "Product"})

    assert response.status_code == 200
    body = response.json()
    assert body["deterministic_score"]["total_score"] == 3
    assert body["llm_evaluation_available"] is False
    assert body["llm_evaluation"] is None


def test_evaluation_endpoints_validate_product_before_calling_llm(monkeypatch) -> None:
    monkeypatch.setattr(
        routes.llm_judge_service,
        "evaluate_product_readiness",
        lambda product: evaluation(),
    )

    assert client.post("/api/v1/evaluate", json={}).status_code == 422
    assert client.post("/api/v1/analyze", json={}).status_code == 422
