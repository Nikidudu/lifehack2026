"""Person B integration point for product content generation."""

from app.models.improvement import ImprovementRequest, ImprovementResult


def improve_product(request: ImprovementRequest) -> ImprovementResult:
    """Placeholder: Person B should replace this body with fill-only generation."""
    return ImprovementResult(
        original_product=request.product,
        improved_product=request.product,
        warnings=["Content generation is not configured; product returned unchanged."],
    )
