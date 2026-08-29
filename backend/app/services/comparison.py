"""Before/after comparison built entirely from deterministic score results."""

from app.models.product import Product
from app.models.scoring import ReadinessComparisonResult
from app.services.scoring import score_product


def compare_products(before: Product, after: Product) -> ReadinessComparisonResult:
    before_score = score_product(before)
    after_score = score_product(after)
    improved = [
        name
        for name, dimension in after_score.dimensions.items()
        if dimension.score > before_score.dimensions[name].score
    ]
    regressed = [
        name
        for name, dimension in after_score.dimensions.items()
        if dimension.score < before_score.dimensions[name].score
    ]
    after_missing = set(after_score.missing_fields)
    completed = [name for name in before_score.missing_fields if name not in after_missing]
    remaining = list(
        dict.fromkeys(
            issue
            for dimension in after_score.dimensions.values()
            for issue in dimension.issues
        )
    )
    return ReadinessComparisonResult(
        before_score=before_score,
        after_score=after_score,
        score_change=after_score.total_score - before_score.total_score,
        improved_dimensions=improved,
        regressed_dimensions=regressed,
        newly_completed_fields=completed,
        remaining_issues=remaining,
    )
