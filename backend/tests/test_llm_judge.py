from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from openai import APIError, APITimeoutError, AuthenticationError

from app.models.product import Product
from app.models.readiness_judge import ReadinessJudgeResult
from app.services.llm_judge import (
    DEFAULT_OPENAI_MODEL,
    LLMJudgeConfigurationError,
    LLMJudgeResponseError,
    LLMJudgeUnavailableError,
    OPENAI_TIMEOUT_SECONDS,
    evaluate_product_readiness,
)
from app.services.scoring import score_product


def judge_result() -> ReadinessJudgeResult:
    return ReadinessJudgeResult(
        semantic_score=75,
        grounding_score=60,
        specificity_score=80,
        reasoning_quality_score=70,
        unsupported_claims=["Fastest available"],
        strengths=["The use case includes concrete conditions."],
        weaknesses=["The comparison has no evidence."],
        recommendations=["Provide a traceable source for the comparison."],
        confidence=0.8,
    )


def mock_client_with_response(parsed: object) -> MagicMock:
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(output_parsed=parsed)
    return client


def test_successful_structured_response(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "test-structured-model")
    product = Product(title="Known product", brand="Known brand")
    expected = judge_result()
    client = mock_client_with_response(expected)

    result = evaluate_product_readiness(product, client=client)

    assert result == expected
    request = client.responses.parse.call_args.kwargs
    assert request["model"] == "test-structured-model"
    assert request["text_format"] is ReadinessJudgeResult
    assert request["temperature"] == 0
    assert request["timeout"] == OPENAI_TIMEOUT_SECONDS
    assert request["input"][0]["role"] == "developer"
    assert request["input"][1]["role"] == "user"
    assert "Known product" in request["input"][1]["content"]
    assert "test-key" not in str(request)


def test_default_model_is_used_when_model_is_not_configured(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    client = mock_client_with_response(judge_result())

    evaluate_product_readiness(Product(title="Product"), client=client)

    assert client.responses.parse.call_args.kwargs["model"] == DEFAULT_OPENAI_MODEL


def test_malformed_response_is_handled(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = mock_client_with_response(None)

    with pytest.raises(LLMJudgeResponseError, match="invalid response"):
        evaluate_product_readiness(Product(title="Product"), client=client)


def test_timeout_is_handled(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = MagicMock()
    client.responses.parse.side_effect = APITimeoutError(request=MagicMock())

    with pytest.raises(LLMJudgeUnavailableError, match="timed out"):
        evaluate_product_readiness(Product(title="Product"), client=client)


def test_authentication_error_is_handled(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "invalid-key")
    client = MagicMock()
    response = MagicMock(status_code=401, request=MagicMock())
    client.responses.parse.side_effect = AuthenticationError(
        "Invalid authentication",
        response=response,
        body=None,
    )

    with pytest.raises(LLMJudgeUnavailableError, match="authenticate"):
        evaluate_product_readiness(Product(title="Product"), client=client)


def test_general_api_error_is_handled(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = MagicMock()
    client.responses.parse.side_effect = APIError(
        "Service unavailable",
        request=MagicMock(),
        body=None,
    )

    with pytest.raises(LLMJudgeUnavailableError, match="temporarily unavailable"):
        evaluate_product_readiness(Product(title="Product"), client=client)


def test_missing_api_key_is_rejected_without_calling_client(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = MagicMock()

    with pytest.raises(LLMJudgeConfigurationError, match="not configured"):
        evaluate_product_readiness(Product(title="Product"), client=client)

    client.responses.parse.assert_not_called()


def test_deterministic_scoring_still_works_after_llm_failure(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = MagicMock()
    client.responses.parse.side_effect = APITimeoutError(request=MagicMock())
    product = Product(title="Product")

    with pytest.raises(LLMJudgeUnavailableError):
        evaluate_product_readiness(product, client=client)

    assert score_product(product).total_score == 3
