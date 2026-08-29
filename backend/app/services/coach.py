import os
from typing import Any

from openai import APIError, APITimeoutError, AuthenticationError, OpenAI
from pydantic import ValidationError

from app.models.coach import CoachOutput, CoachRequest, CoachResponse
from app.models.product import Product
from app.services.llm_judge import DEFAULT_OPENAI_MODEL, OPENAI_TIMEOUT_SECONDS


SYSTEM_PROMPT = """You are an interactive AI commerce-readiness coach.
Use the current Product, deterministic score, and conversation to ask one useful question at a time.
When the user's latest message supplies product information, incorporate it into the canonical product. Preserve existing information unless the user explicitly corrects it. You may organize the user's answer into use cases, personas, constraints, comparisons, narrative, or other matching fields. Never fabricate evidence or sources. Clearly label speculative suggestions in your conversational message. Keep the reply concise and end with one natural follow-up question. The message field must contain friendly prose only: never JSON, code, field dumps, or the updated product. Serialize the full updated Product JSON only into updated_product_json."""


class CoachUnavailableError(RuntimeError):
    pass


def chat(request: CoachRequest, *, client: Any = None) -> CoachResponse:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise CoachUnavailableError("AI coach is not configured")
    api = client or OpenAI(api_key=key, timeout=OPENAI_TIMEOUT_SECONDS, max_retries=1)
    context = (
        f"CURRENT PRODUCT:\n{request.product.model_dump_json(indent=2)}\n\n"
        f"CURRENT SCORE:\n{request.score.model_dump_json(indent=2)}"
    )
    conversation = [{"role": item.role, "content": item.content} for item in request.messages]
    try:
        response = api.responses.parse(
            model=os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL,
            input=[{"role": "developer", "content": SYSTEM_PROMPT}, {"role": "developer", "content": context},
                   *conversation, {"role": "user", "content": request.message}],
            text_format=CoachOutput, temperature=0.2, timeout=OPENAI_TIMEOUT_SECONDS, store=False,
        )
        output = response.output_parsed
    except (APIError, APITimeoutError, AuthenticationError, ValidationError, ValueError, TypeError) as exc:
        raise CoachUnavailableError("AI coach is temporarily unavailable") from exc
    if not isinstance(output, CoachOutput):
        raise CoachUnavailableError("AI coach returned an invalid response")
    try:
        updated_product = Product.model_validate_json(output.updated_product_json)
    except ValidationError as exc:
        raise CoachUnavailableError("AI coach returned an invalid product") from exc
    changed = [name for name in Product.model_fields if getattr(request.product, name) != getattr(updated_product, name)]
    return CoachResponse(message=output.message, updated_product=updated_product, changed_fields=changed)
