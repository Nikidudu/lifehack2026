import json

import pytest
from pydantic import ValidationError

from app.models.product import Product
from app.models.readiness_judge import ReadinessJudgeResult
from app.prompts.readiness_judge import (
    READINESS_JUDGE_SYSTEM_PROMPT,
    build_readiness_judge_prompt,
)


def valid_result_payload() -> dict[str, object]:
    return {
        "semantic_score": 72,
        "grounding_score": 60,
        "specificity_score": 80,
        "reasoning_quality_score": 68,
        "unsupported_claims": ["Best performance available"],
        "strengths": ["Use cases include concrete operating conditions."],
        "weaknesses": ["The comparison has no evidence."],
        "recommendations": ["Provide the source for the comparative performance claim."],
        "confidence": 0.85,
    }


def test_valid_judge_result() -> None:
    result = ReadinessJudgeResult.model_validate(valid_result_payload())

    assert result.semantic_score == 72
    assert result.confidence == 0.85


def test_boundary_scores_and_confidence_are_valid() -> None:
    payload = valid_result_payload()
    payload.update(
        semantic_score=0,
        grounding_score=100,
        specificity_score=0,
        reasoning_quality_score=100,
        confidence=1,
    )

    result = ReadinessJudgeResult.model_validate(payload)

    assert result.semantic_score == 0
    assert result.grounding_score == 100
    assert result.confidence == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("semantic_score", -1),
        ("grounding_score", 101),
        ("specificity_score", -10),
        ("reasoning_quality_score", 101),
        ("confidence", -0.01),
        ("confidence", 1.01),
    ],
)
def test_out_of_range_values_are_rejected(field: str, value: object) -> None:
    payload = valid_result_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        ReadinessJudgeResult.model_validate(payload)


def test_missing_required_score_is_rejected() -> None:
    payload = valid_result_payload()
    del payload["semantic_score"]

    with pytest.raises(ValidationError):
        ReadinessJudgeResult.model_validate(payload)


def test_unknown_output_field_is_rejected() -> None:
    payload = valid_result_payload()
    payload["invented_facts"] = ["Not allowed"]

    with pytest.raises(ValidationError):
        ReadinessJudgeResult.model_validate(payload)


def test_result_serializes_and_deserializes_cleanly() -> None:
    original = ReadinessJudgeResult.model_validate(valid_result_payload())

    restored = ReadinessJudgeResult.model_validate_json(original.model_dump_json())

    assert restored == original


def test_prompt_contains_only_supplied_product_and_judge_guardrails() -> None:
    product = Product(title="Known Product", claims=[{"claim": "A supplied claim"}])

    prompt = build_readiness_judge_prompt(product)
    product_json = json.loads(prompt.split("PRODUCT JSON:\n", 1)[1].split("\n\nReturn exactly", 1)[0])

    assert product_json == product.model_dump(mode="json")
    assert "Do not add product facts" in prompt
    assert "JUDGE, not generator" in READINESS_JUDGE_SYSTEM_PROMPT
    assert "Do not use outside knowledge" in READINESS_JUDGE_SYSTEM_PROMPT
    assert "If evidence is absent" in READINESS_JUDGE_SYSTEM_PROMPT
