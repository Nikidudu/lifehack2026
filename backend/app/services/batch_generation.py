import json
import os
from typing import Any

from openai import OpenAI
from pydantic import BaseModel, ConfigDict

from app.models.batch import BatchImprovementRequest, BatchImprovementResult, FieldSuggestion, ProductSuggestions
from app.models.improvement import ProductEnrichment, is_empty
from app.services.llm_judge import DEFAULT_OPENAI_MODEL, OPENAI_TIMEOUT_SECONDS


FIELDS = ("description", "use_cases", "target_personas", "constraints_handled", "narrative", "comparisons")


class BatchEnrichmentItem(ProductEnrichment):
    product_index: int


class BatchEnrichment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    products: list[BatchEnrichmentItem]


PROMPT = """Create optional commerce-content suggestions for every supplied product.
You may infer plausible use cases, audiences, constraints, narrative, and balanced comparisons with other products in this same catalog. These are unverified drafts for human approval, not facts. Never alter identity, price, specifications, dimensions, materials, availability, claims, evidence, or sources. Prefer comparisons against products in the supplied catalog. Use product_index exactly and return every product once."""


def suggest_products(request: BatchImprovementRequest, *, client: Any = None) -> BatchImprovementResult:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return BatchImprovementResult(products=[], warnings=["OPENAI_API_KEY is not configured."])
    api = client or OpenAI(api_key=key, timeout=OPENAI_TIMEOUT_SECONDS, max_retries=1)
    indexed = [{"product_index": index, "product": product.model_dump(mode="json")} for index, product in enumerate(request.products)]
    try:
        response = api.responses.parse(
            model=os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL,
            input=[{"role": "developer", "content": PROMPT}, {"role": "user", "content": json.dumps(indexed)}],
            text_format=BatchEnrichment, temperature=0.2, timeout=OPENAI_TIMEOUT_SECONDS, store=False,
        )
        generated = response.output_parsed
    except Exception:
        return BatchImprovementResult(products=[], warnings=["Suggestion generation is temporarily unavailable."])

    output = []
    for item in generated.products:
        if not 0 <= item.product_index < len(request.products):
            continue
        original = request.products[item.product_index]
        suggestions = []
        for field in FIELDS:
            value = getattr(item, field)
            if not is_empty(value) and value != getattr(original, field):
                if isinstance(value, BaseModel):
                    value = value.model_dump(mode="json")
                elif isinstance(value, list):
                    value = [entry.model_dump(mode="json") if isinstance(entry, BaseModel) else entry for entry in value]
                suggestions.append(FieldSuggestion(field=field, value=value))
        output.append(ProductSuggestions(product_index=item.product_index, product_id=original.product_id, title=original.title, suggestions=suggestions))
    return BatchImprovementResult(products=output, warnings=["AI suggestions are unverified until a user accepts them."])
