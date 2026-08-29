"""Grounded, fill-only product content generation."""

import os
from typing import Any

from openai import APIError, APITimeoutError, AuthenticationError, OpenAI
from pydantic import ValidationError

from app.models.improvement import (
    ImprovementRequest,
    ImprovementResult,
    ProductEnrichment,
    is_empty,
)
from app.models.product import HandledConstraints
from app.prompts.product_generation import (
    PRODUCT_GENERATION_SYSTEM_PROMPT,
    build_product_generation_prompt,
)
from app.services.llm_judge import DEFAULT_OPENAI_MODEL, OPENAI_TIMEOUT_SECONDS


GENERATABLE_FIELDS = (
    "description",
    "use_cases",
    "target_personas",
    "constraints_handled",
    "narrative",
)


def _unchanged(request: ImprovementRequest, warning: str) -> ImprovementResult:
    return ImprovementResult(
        original_product=request.product,
        improved_product=request.product,
        warnings=[warning],
    )


def improve_product(request: ImprovementRequest, *, client: Any = None) -> ImprovementResult:
    """Fill missing semantic fields while preserving every supplied value."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        return _unchanged(
            request,
            "OPENAI_API_KEY is not configured; product returned unchanged.",
        )

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
                {"role": "developer", "content": PRODUCT_GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": build_product_generation_prompt(request)},
            ],
            text_format=ProductEnrichment,
            temperature=0.2,
            timeout=OPENAI_TIMEOUT_SECONDS,
            store=False,
        )
    except (APIError, APITimeoutError, AuthenticationError, ValidationError, ValueError, TypeError):
        return _unchanged(request, "Content generation failed; product returned unchanged.")

    enrichment = getattr(response, "output_parsed", None)
    if not isinstance(enrichment, ProductEnrichment):
        return _unchanged(request, "Content generation returned an invalid response; product returned unchanged.")

    updates = {}
    for name in GENERATABLE_FIELDS:
        value = getattr(enrichment, name)
        if name == "constraints_handled" and value is not None:
            # ponytail: custom constraint keys stay empty; fixed keys keep Structured Outputs strict.
            value = HandledConstraints(**value.model_dump())
        if is_empty(getattr(request.product, name)) and not is_empty(value):
            updates[name] = value
    if not updates:
        return _unchanged(request, "No grounded semantic fields could be generated.")

    improved = request.product.model_copy(update=updates)
    return ImprovementResult(
        original_product=request.product,
        improved_product=improved,
        generated_fields=list(updates),
        warnings=["AI-generated semantic fields require review against source catalog data."],
    )
