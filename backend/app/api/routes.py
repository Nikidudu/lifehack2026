"""HTTP routes for the versioned public API."""

from fastapi import APIRouter

from app.models.product import (
    PRODUCT_SCHEMA_VERSION,
    SUPPORTED_PRODUCT_SECTIONS,
    Product,
)
from app.models.scoring import SchemaMetadata, ScoringResult
from app.services import scoring as scoring_service


router = APIRouter(prefix="/api/v1")


@router.get("/schema", response_model=SchemaMetadata)
def get_schema_metadata() -> SchemaMetadata:
    """Describe the shared product schema and deterministic scoring dimensions."""
    dimensions = scoring_service.DIMENSION_MAX_SCORES
    return SchemaMetadata(
        schema_version=PRODUCT_SCHEMA_VERSION,
        scoring_version=scoring_service.SCORING_VERSION,
        supported_sections=list(SUPPORTED_PRODUCT_SECTIONS),
        scoring_dimensions=dimensions,
        total_maximum_score=sum(dimensions.values()),
    )


@router.post("/score", response_model=ScoringResult)
def score_product(product: Product) -> ScoringResult:
    """Calculate a deterministic readiness score for a product."""
    return scoring_service.score_product(product)
