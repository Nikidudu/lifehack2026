import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import routes
from app.main import app
from app.models.product import Product
from app.models.readiness_judge import ReadinessJudgeResult
from app.services.scoring import score_claims_and_evidence, score_product


client = TestClient(app)
EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def llm_result() -> ReadinessJudgeResult:
    return ReadinessJudgeResult(
        semantic_score=50,
        grounding_score=50,
        specificity_score=50,
        reasoning_quality_score=50,
        unsupported_claims=[],
        strengths=[],
        weaknesses=[],
        recommendations=[],
        confidence=0.5,
    )


def test_empty_optional_strings_receive_no_credit() -> None:
    result = score_product(
        Product(
            title="Product",
            product_id="",
            brand="",
            category="",
            description="",
            currency="",
            availability="",
            narrative="",
        )
    )

    assert result.total_score == 3


def test_whitespace_only_title_is_rejected() -> None:
    with pytest.raises(ValidationError, match="title must not be blank"):
        Product(title=" \t\n ")


def test_whitespace_optional_strings_receive_no_credit() -> None:
    result = score_product(Product(title="Product", brand="   ", description="\t"))

    assert result.dimensions["core_information"].score == 3


def test_extremely_long_description_has_fixed_credit() -> None:
    short = score_product(Product(title="Product", description="Short"))
    long = score_product(Product(title="Product", description="x" * 1_000_000))

    assert short.total_score == long.total_score == 6


def test_explicit_empty_arrays_match_safe_defaults() -> None:
    explicit = Product(
        title="Product",
        materials=[],
        use_cases=[],
        target_personas=[],
        comparisons=[],
        claims=[],
    )

    assert score_product(explicit) == score_product(Product(title="Product"))


def test_duplicate_use_cases_do_not_multiply_credit() -> None:
    use_case = {
        "name": "Road training",
        "description": "Daily road training.",
        "conditions": ["Humid", "Paved roads"],
    }
    product = Product(title="Product", use_cases=[use_case, use_case, use_case])

    assert score_product(product).dimensions["use_case_coverage"].score == 5


def test_duplicate_personas_do_not_multiply_credit() -> None:
    persona = {
        "name": "Runner",
        "description": "Recreational runner.",
        "priorities": ["Weight"],
        "constraints": ["Budget"],
    }
    product = Product(title="Product", target_personas=[persona, persona, persona])

    assert score_product(product).dimensions["persona_coverage"].score == 4


def test_missing_price_gets_no_price_or_currency_credit() -> None:
    result = score_product(Product(title="Product", currency="SGD"))

    assert result.dimensions["core_information"].score == 3
    assert "price" in result.missing_fields


def test_zero_price_is_valid_and_scored() -> None:
    result = score_product(Product(title="Free sample", price=0, currency="SGD"))

    assert result.dimensions["core_information"].score == 7


def test_negative_price_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Product(title="Product", price=-0.01)


def test_unusual_currency_is_preserved_without_invented_enum() -> None:
    product = Product(title="Product", price=10, currency="XTS-DEMO")

    assert product.currency == "XTS-DEMO"
    assert score_product(product).dimensions["core_information"].score == 7


def test_unicode_product_name_round_trips_through_api() -> None:
    title = "鞋子 👟 Chaussure café"

    response = client.post("/api/v1/score", json={"title": title})

    assert response.status_code == 200
    assert Product(title=title).model_dump_json()


def test_unknown_category_remains_valid() -> None:
    product = Product(title="Product", category="Quantum moon footwear")

    assert score_product(product).dimensions["core_information"].score == 6


def test_malformed_claim_without_claim_text_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Product.model_validate({"title": "Product", "claims": [{"evidence": "Report"}]})


def test_claim_with_empty_evidence_is_unsupported() -> None:
    evaluation = score_claims_and_evidence(
        Product(title="Product", claims=[{"claim": "Fastest", "evidence": "  "}])
    )

    assert evaluation.result.score == 1
    assert evaluation.critical_issues


def test_blank_claim_cannot_earn_evidence_credit() -> None:
    evaluation = score_claims_and_evidence(
        Product(
            title="Product",
            claims=[{"claim": " ", "evidence": "Report", "source": "Fixture"}],
        )
    )

    assert evaluation.result.score == 0


def test_hundreds_of_specifications_are_capped() -> None:
    product = Product(
        title="Product",
        specifications={f"spec-{index}": str(index) for index in range(500)},
    )

    assert score_product(product).dimensions["structured_attributes"].score == 8


def test_unexpected_product_fields_are_rejected_by_api() -> None:
    response = client.post(
        "/api/v1/score",
        json={"title": "Product", "secret_optional_field": "surprise"},
    )

    assert response.status_code == 422


def test_minimal_valid_product_remains_stable() -> None:
    assert score_product(Product(title="Product")).total_score == 3


def test_fully_populated_fixture_remains_valid() -> None:
    product = Product.model_validate_json(
        (EXAMPLES / "demo_running_shoe_improved.json").read_text(encoding="utf-8")
    )

    assert score_product(product).total_score == 85


def test_scoring_is_identical_across_one_hundred_runs() -> None:
    product = Product.model_validate_json(
        (EXAMPLES / "demo_running_shoe_improved.json").read_text(encoding="utf-8")
    )
    expected = score_product(product)

    assert all(score_product(product) == expected for _ in range(100))


def test_every_endpoint_without_real_external_calls(monkeypatch) -> None:
    monkeypatch.setattr(
        routes.llm_judge_service,
        "evaluate_product_readiness",
        lambda product: llm_result(),
    )
    product = {"title": "Product"}
    score = client.post("/api/v1/score", json=product).json()
    requests = [
        ("get", "/health", None),
        ("get", "/api/v1/schema", None),
        ("post", "/api/v1/score", product),
        ("post", "/api/v1/evaluate", product),
        ("post", "/api/v1/analyze", product),
        ("post", "/api/v1/improve", {"product": product, "score": score}),
        ("post", "/api/v1/compare", {"before": product, "after": product}),
        ("post", "/api/v1/simulate", {"product": product, "queries": ["A shoe"]}),
    ]

    for method, path, payload in requests:
        response = getattr(client, method)(path, json=payload) if payload else getattr(client, method)(path)
        assert response.status_code == 200, (path, response.text)
