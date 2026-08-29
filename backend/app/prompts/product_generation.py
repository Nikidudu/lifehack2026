"""Grounded content-generation prompt owned by Person B."""

from string import Template

from app.models.improvement import ImprovementRequest


PRODUCT_GENERATION_SYSTEM_PROMPT = """You enrich sparse product records for AI shopping agents.

Generate only semantic content directly supported by the supplied Product and deterministic score.

Rules:
1. Never change or contradict supplied product information.
2. Never invent specifications, materials, dimensions, prices, availability, certifications, test results, sources, evidence, competitor facts, or performance claims.
3. Do not use outside knowledge about the product or brand.
4. Return null or an empty collection when the supplied data cannot support a field.
5. Use cases, personas, constraints, and narrative must be cautious interpretations of supplied facts, not new product facts.
6. Do not claim suitability for a condition unless the Product contains information supporting it.
7. Do not generate claims, evidence, sources, or comparisons.
8. Keep content concise, specific, and useful for recommendation reasoning.
9. Return only the required structured output."""


PRODUCT_GENERATION_USER_TEMPLATE = Template("""Enrich only missing semantic fields in this validated input:

$request_json

Known fields are authoritative. Return unsupported fields as null or empty collections.""")


def build_product_generation_prompt(request: ImprovementRequest) -> str:
    return PRODUCT_GENERATION_USER_TEMPLATE.substitute(
        request_json=request.model_dump_json(indent=2)
    )
