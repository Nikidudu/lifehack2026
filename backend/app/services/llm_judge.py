"""Optional OpenAI-backed semantic readiness judge."""

import os
from typing import Protocol

from openai import APIError, APITimeoutError, AuthenticationError, OpenAI
from pydantic import ValidationError

from app.models.product import Product
from app.models.readiness_judge import ReadinessJudgeResult
from app.prompts.readiness_judge import (
    READINESS_JUDGE_SYSTEM_PROMPT,
    build_readiness_judge_prompt,
)


DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
OPENAI_TIMEOUT_SECONDS = 20.0


class _ResponsesAPI(Protocol):
    def parse(self, **kwargs): ...


class _OpenAIClient(Protocol):
    responses: _ResponsesAPI


class LLMJudgeError(RuntimeError):
    """Base error safe for callers to handle without SDK coupling."""


class LLMJudgeConfigurationError(LLMJudgeError):
    """The optional judge is not configured."""


class LLMJudgeResponseError(LLMJudgeError):
    """The model did not return a valid structured evaluation."""


class LLMJudgeUnavailableError(LLMJudgeError):
    """The remote evaluation service could not complete the request."""


def evaluate_product_readiness(
    product: Product,
    *,
    client: _OpenAIClient | None = None,
) -> ReadinessJudgeResult:
    """Evaluate semantic readiness without affecting deterministic scoring."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise LLMJudgeConfigurationError("The optional readiness judge is not configured.")

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    openai_client = client or OpenAI(
        api_key=api_key,
        timeout=OPENAI_TIMEOUT_SECONDS,
        max_retries=1,
    )

    try:
        response = openai_client.responses.parse(
            model=model,
            input=[
                {"role": "developer", "content": READINESS_JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": build_readiness_judge_prompt(product)},
            ],
            text_format=ReadinessJudgeResult,
            temperature=0,
            timeout=OPENAI_TIMEOUT_SECONDS,
        )
    except APITimeoutError as exc:
        raise LLMJudgeUnavailableError("The optional readiness judge timed out.") from exc
    except AuthenticationError as exc:
        raise LLMJudgeUnavailableError("The optional readiness judge could not authenticate.") from exc
    except APIError as exc:
        raise LLMJudgeUnavailableError("The optional readiness judge is temporarily unavailable.") from exc
    except (ValidationError, ValueError, TypeError) as exc:
        raise LLMJudgeResponseError("The optional readiness judge returned an invalid response.") from exc

    parsed = getattr(response, "output_parsed", None)
    if not isinstance(parsed, ReadinessJudgeResult):
        raise LLMJudgeResponseError("The optional readiness judge returned an invalid response.")
    return parsed
