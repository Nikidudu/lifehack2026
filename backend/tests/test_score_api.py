import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)
EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


def complete_product_payload() -> dict[str, object]:
    return json.loads((EXAMPLES_DIR / "sample_product_complete.json").read_text(encoding="utf-8"))


def test_score_valid_minimal_product() -> None:
    response = client.post("/api/v1/score", json={"title": "Minimal product"})

    assert response.status_code == 200
    body = response.json()
    assert body["total_score"] == 3
    assert body["readiness_level"] == "Not AI-Ready"


def test_score_valid_complete_product() -> None:
    response = client.post("/api/v1/score", json=complete_product_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["total_score"] == 61
    assert body["readiness_level"] == "AI-Ready with Gaps"
    assert body["critical_issues"] == []


def test_score_rejects_missing_title() -> None:
    response = client.post("/api/v1/score", json={"brand": "Example"})

    assert response.status_code == 422
    assert response.json()["detail"]


def test_score_rejects_malformed_price() -> None:
    response = client.post(
        "/api/v1/score",
        json={"title": "Invalid price", "price": "not-a-number"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]


def test_returned_dimensions_sum_to_total() -> None:
    body = client.post("/api/v1/score", json=complete_product_payload()).json()

    assert sum(item["score"] for item in body["dimensions"].values()) == body["total_score"]


def test_returned_total_is_within_score_range() -> None:
    for payload in ({"title": "Minimal"}, complete_product_payload()):
        response = client.post("/api/v1/score", json=payload)

        assert response.status_code == 200
        assert 0 <= response.json()["total_score"] <= 100


def test_repeated_requests_return_identical_results() -> None:
    payload = complete_product_payload()

    first = client.post("/api/v1/score", json=payload)
    second = client.post("/api/v1/score", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


def test_unexpected_error_returns_safe_response(monkeypatch) -> None:
    from app.api import routes

    def raise_unexpected_error(product) -> None:
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(routes.scoring_service, "score_product", raise_unexpected_error)
    safe_client = TestClient(app, raise_server_exceptions=False)

    response = safe_client.post("/api/v1/score", json={"title": "Valid product"})

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "secret internal detail" not in response.text


def test_schema_metadata_exposes_versions_sections_and_weights() -> None:
    response = client.get("/api/v1/schema")

    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "1.0.0"
    assert body["scoring_version"] == "1.0.0"
    assert body["supported_sections"] == [
        "identity",
        "core_attributes",
        "use_cases",
        "target_personas",
        "comparisons",
        "claims_and_evidence",
        "constraints_handled",
        "storytelling",
    ]
    assert body["scoring_dimensions"] == {
        "core_information": 20,
        "structured_attributes": 15,
        "use_case_coverage": 15,
        "persona_coverage": 12,
        "comparison_information": 10,
        "claims_and_evidence": 15,
        "constraint_coverage": 10,
        "storytelling_context": 3,
    }
    assert body["total_maximum_score"] == 100
    assert sum(body["scoring_dimensions"].values()) == body["total_maximum_score"]
