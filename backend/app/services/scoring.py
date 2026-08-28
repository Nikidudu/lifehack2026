"""Deterministic AI Commerce Readiness scoring engine."""

from dataclasses import dataclass, field

from app.models.product import Product
from app.models.scoring import DimensionScore, ScoringResult


DIMENSION_MAX_SCORES = {
    "core_information": 20,
    "structured_attributes": 15,
    "use_case_coverage": 15,
    "persona_coverage": 12,
    "comparison_information": 10,
    "claims_and_evidence": 15,
    "constraint_coverage": 10,
    "storytelling_context": 3,
}
SCORING_VERSION = "1.0.0"


@dataclass
class DimensionEvaluation:
    result: DimensionScore
    missing_fields: list[str] = field(default_factory=list)
    critical_issues: list[str] = field(default_factory=list)


def _present(value: str | None) -> bool:
    return bool(value and value.strip())


def _unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        normalized = value.strip().casefold()
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique.append(value.strip())
    return unique


def _evaluation(
    score: int,
    dimension: str,
    issues: list[str],
    suggestions: list[str],
    missing_fields: list[str],
    critical_issues: list[str] | None = None,
) -> DimensionEvaluation:
    maximum = DIMENSION_MAX_SCORES[dimension]
    return DimensionEvaluation(
        result=DimensionScore(
            score=max(0, min(score, maximum)),
            max_score=maximum,
            issues=issues,
            suggestions=suggestions,
        ),
        missing_fields=missing_fields,
        critical_issues=critical_issues or [],
    )


def score_core_information(product: Product) -> DimensionEvaluation:
    score = 3  # Product validation guarantees a nonblank title.
    issues: list[str] = []
    suggestions: list[str] = []
    missing: list[str] = []

    fields = (
        ("product_id", product.product_id, 1, "Add a stable catalog identifier so systems can reference the same product reliably."),
        ("brand", product.brand, 3, "Identify the brand so agents can answer brand-specific intents and attribute claims correctly."),
        ("category", product.category, 3, "Provide the product category so agents can compare it with relevant alternatives."),
        ("description", product.description, 3, "Add a concise factual description covering what the product is and its primary purpose."),
        ("availability", product.availability, 3, "State availability, such as in stock, preorder, or unavailable, to prevent unusable recommendations."),
    )
    for name, value, points, suggestion in fields:
        if _present(value):
            score += points
        else:
            missing.append(name)
            issues.append(f"{name} is missing.")
            suggestions.append(suggestion)

    if product.price is not None:
        score += 3
        if _present(product.currency):
            score += 1
        else:
            missing.append("currency")
            issues.append("currency is missing for the provided price.")
            suggestions.append("Specify the price currency, such as SGD or USD, so budget comparisons are unambiguous.")
    else:
        missing.append("price")
        issues.append("price is missing.")
        suggestions.append("Provide the current numeric price so agents can evaluate budget constraints.")
        if not _present(product.currency):
            missing.append("currency")

    return _evaluation(score, "core_information", issues, suggestions, missing)


def score_structured_attributes(product: Product) -> DimensionEvaluation:
    valid_specs = {
        key.strip().casefold(): value
        for key, value in product.specifications.items()
        if key.strip() and value.strip()
    }
    materials = _unique_strings(product.materials)
    dimensions_present = (
        _present(product.dimensions)
        if isinstance(product.dimensions, str)
        else bool(
            product.dimensions
            and any(key.strip() and value.strip() for key, value in product.dimensions.items())
        )
    )
    score = min(len(valid_specs), 4) * 2 + min(len(materials), 2) * 2 + (3 if dimensions_present else 0)
    issues: list[str] = []
    suggestions: list[str] = []
    missing: list[str] = []
    if len(valid_specs) < 4:
        issues.append(f"Only {len(valid_specs)} valid specification(s) are provided; four earn full coverage.")
        suggestions.append("Add factual specification key/value pairs relevant to comparison, such as weight, capacity, performance, or model compatibility.")
        if not valid_specs:
            missing.append("specifications")
    if len(materials) < 2:
        issues.append(f"Only {len(materials)} distinct material(s) are provided; two earn full coverage.")
        suggestions.append("List the product's known component materials separately, without guessing unverified composition.")
        if not materials:
            missing.append("materials")
    if not dimensions_present:
        issues.append("dimensions are missing.")
        suggestions.append("Provide relevant sizing or dimensions as free text or named measurements with units.")
        missing.append("dimensions")
    return _evaluation(score, "structured_attributes", issues, suggestions, missing)


def score_use_case_coverage(product: Product) -> DimensionEvaluation:
    score = 0
    issues: list[str] = []
    suggestions: list[str] = []
    for index, use_case in enumerate(product.use_cases[:3]):
        conditions = _unique_strings(use_case.conditions)
        score += int(_present(use_case.name))
        score += 2 * int(_present(use_case.description))
        score += int(len(conditions) >= 1) + int(len(conditions) >= 2)
        if not _present(use_case.name) or not _present(use_case.description):
            issues.append(f"use_cases[{index}] lacks a clear name or description.")
        if len(conditions) < 2:
            issues.append(f"use_cases[{index}] has fewer than two distinct conditions.")
    if len(product.use_cases) < 3:
        issues.append(f"Only {len(product.use_cases)} use case(s) are provided; three earn full coverage.")
        suggestions.append("Describe additional concrete scenarios the product supports, including the environmental or usage conditions for each.")
    if product.use_cases and any(len(_unique_strings(item.conditions)) < 2 for item in product.use_cases[:3]):
        suggestions.append("For each use case, add specific applicable conditions such as environment, frequency, surface, or operating context.")
    missing = ["use_cases"] if not product.use_cases else []
    return _evaluation(score, "use_case_coverage", issues, suggestions, missing)


def score_persona_coverage(product: Product) -> DimensionEvaluation:
    score = 0
    issues: list[str] = []
    suggestions: list[str] = []
    for index, persona in enumerate(product.target_personas[:3]):
        score += int(_present(persona.name))
        score += int(_present(persona.description))
        score += int(bool(_unique_strings(persona.priorities)))
        score += int(bool(_unique_strings(persona.constraints)))
        if not _unique_strings(persona.priorities):
            issues.append(f"target_personas[{index}] has no stated priorities.")
        if not _unique_strings(persona.constraints):
            issues.append(f"target_personas[{index}] has no stated constraints.")
    if len(product.target_personas) < 3:
        issues.append(f"Only {len(product.target_personas)} persona(s) are provided; three earn full coverage.")
        suggestions.append("Add distinct buyer personas with their decision priorities and purchasing or usage constraints.")
    if product.target_personas and any(
        not _present(item.name) or not _present(item.description) for item in product.target_personas[:3]
    ):
        suggestions.append("Give every persona a clear name and description explaining who the buyer is.")
    missing = ["target_personas"] if not product.target_personas else []
    return _evaluation(score, "persona_coverage", issues, suggestions, missing)


def score_comparison_information(product: Product) -> DimensionEvaluation:
    score = 0
    issues: list[str] = []
    suggestions: list[str] = []
    for index, comparison in enumerate(product.comparisons[:2]):
        score += int(_present(comparison.alternative))
        score += int(bool(_unique_strings(comparison.advantages)))
        score += int(bool(_unique_strings(comparison.disadvantages)))
        score += 2 * int(_present(comparison.evidence))
        if not _present(comparison.evidence):
            issues.append(f"comparisons[{index}] has no supporting evidence.")
    if len(product.comparisons) < 2:
        issues.append(f"Only {len(product.comparisons)} comparison(s) are provided; two earn full coverage.")
        suggestions.append("Add balanced comparisons against relevant alternatives, covering both advantages and disadvantages.")
    if product.comparisons and any(not _present(item.evidence) for item in product.comparisons[:2]):
        suggestions.append("Attach factual evidence to comparative statements, such as published specifications or test results.")
    missing = ["comparisons"] if not product.comparisons else []
    return _evaluation(score, "comparison_information", issues, suggestions, missing)


def score_claims_and_evidence(product: Product) -> DimensionEvaluation:
    score = 0
    issues: list[str] = []
    suggestions: list[str] = []
    critical: list[str] = []
    for index, claim in enumerate(product.claims[:3]):
        claim_present = _present(claim.claim)
        evidence_present = _present(claim.evidence)
        score += int(claim_present)
        score += 3 * int(evidence_present)
        score += int(evidence_present and _present(claim.source))
        if claim_present and not evidence_present:
            message = f"claims[{index}] is unsupported: {claim.claim.strip()}"
            issues.append(message)
            critical.append(message)
        if evidence_present and not _present(claim.source):
            issues.append(f"claims[{index}] has evidence but no source.")
    if len(product.claims) < 3:
        issues.append(f"Only {len(product.claims)} structured claim(s) are provided; three earn full coverage.")
        suggestions.append("Record important marketing or performance claims individually so their support can be assessed.")
    if any(_present(item.claim) and not _present(item.evidence) for item in product.claims[:3]):
        suggestions.append("For each unsupported claim, attach specific substantiation such as a certification, test result, or material report; remove claims that cannot be supported.")
    if any(_present(item.evidence) and not _present(item.source) for item in product.claims[:3]):
        suggestions.append("Add the evidence source, such as a document reference or URL, so an agent can trace the substantiation.")
    missing = ["claims"] if not product.claims else []
    return _evaluation(score, "claims_and_evidence", issues, suggestions, missing, critical)


def score_constraint_coverage(product: Product) -> DimensionEvaluation:
    constraints = product.constraints_handled
    standard = (
        ("budget", constraints.budget, 2),
        ("climate", constraints.climate, 1),
        ("geography", constraints.geography, 1),
        ("time", constraints.time, 1),
        ("compatibility", constraints.compatibility, 2),
        ("accessibility", constraints.accessibility, 1),
    )
    score = 0
    missing: list[str] = []
    for name, values, points in standard:
        if _unique_strings(values):
            score += points
        else:
            missing.append(f"constraints_handled.{name}")
    populated_other = sum(
        1 for key, values in constraints.other.items() if key.strip() and _unique_strings(values)
    )
    score += min(populated_other, 2)
    issues = [f"No {name.removeprefix('constraints_handled.')} constraint is documented." for name in missing]
    if populated_other < 2:
        issues.append(f"Only {populated_other} populated custom constraint category/categories are provided.")
    suggestions = []
    if missing or populated_other < 2:
        suggestions.append("Document only constraints the product demonstrably satisfies, using concrete values such as price ceilings, climates, regions, setup time, compatible systems, or accessibility support.")
    return _evaluation(score, "constraint_coverage", issues, suggestions, missing)


def score_storytelling_context(product: Product) -> DimensionEvaluation:
    length = len(product.narrative.strip()) if _present(product.narrative) else 0
    score = 0 if length == 0 else 1 if length < 40 else 2 if length < 120 else 3
    issues = [] if score == 3 else [f"The product narrative provides {length} character(s) of context; 120 earn full coverage."]
    suggestions = [] if score == 3 else ["Add a concise factual narrative connecting the product's purpose, audience, and relevant brand context without introducing unsupported claims."]
    missing = ["narrative"] if length == 0 else []
    return _evaluation(score, "storytelling_context", issues, suggestions, missing)


def readiness_level(score: int) -> str:
    if score <= 39:
        return "Not AI-Ready"
    if score <= 59:
        return "Developing"
    if score <= 79:
        return "AI-Ready with Gaps"
    return "Highly AI-Ready"


def score_product(product: Product) -> ScoringResult:
    evaluations = {
        "core_information": score_core_information(product),
        "structured_attributes": score_structured_attributes(product),
        "use_case_coverage": score_use_case_coverage(product),
        "persona_coverage": score_persona_coverage(product),
        "comparison_information": score_comparison_information(product),
        "claims_and_evidence": score_claims_and_evidence(product),
        "constraint_coverage": score_constraint_coverage(product),
        "storytelling_context": score_storytelling_context(product),
    }
    dimensions = {name: evaluation.result for name, evaluation in evaluations.items()}
    total = sum(dimension.score for dimension in dimensions.values())

    missing_fields = list(
        dict.fromkeys(field for evaluation in evaluations.values() for field in evaluation.missing_fields)
    )
    critical_issues = list(
        dict.fromkeys(issue for evaluation in evaluations.values() for issue in evaluation.critical_issues)
    )
    ranked = sorted(
        evaluations.items(),
        key=lambda item: (item[1].result.score / item[1].result.max_score),
    )
    recommendations = list(
        dict.fromkeys(
            suggestion
            for _, evaluation in ranked
            for suggestion in evaluation.result.suggestions
        )
    )[:5]

    return ScoringResult(
        total_score=max(0, min(total, 100)),
        readiness_level=readiness_level(total),
        dimensions=dimensions,
        missing_fields=missing_fields,
        critical_issues=critical_issues,
        top_recommendations=recommendations,
    )
