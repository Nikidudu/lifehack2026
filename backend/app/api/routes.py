"""HTTP routes for the versioned public API."""

from fastapi import APIRouter, HTTPException

from app.models.improvement import ImprovementRequest, ImprovementResult
from app.models.product import (
    PRODUCT_SCHEMA_VERSION,
    SUPPORTED_PRODUCT_SECTIONS,
    Product,
)
from app.models.readiness_judge import ReadinessJudgeResult
from app.models.scoring import (
    AnalysisResult,
    ReadinessComparisonRequest,
    ReadinessComparisonResult,
    SchemaMetadata,
    ScoringResult,
)
from app.models.simulation import SimulationRequest, SimulationResult
from app.services import comparison as comparison_service
from app.services import llm_judge as llm_judge_service
from app.services import generation as generation_service
from app.services import scoring as scoring_service
from app.services import simulation as simulation_service


router = APIRouter(prefix="/api/v1")


@router.post("/simulate", response_model=SimulationResult)
def simulate_queries(request: SimulationRequest) -> SimulationResult:
    """Hand validated queries to Person D's isolated simulation service."""
    return simulation_service.simulate_queries(request)


@router.post("/compare", response_model=ReadinessComparisonResult)
def compare_products(request: ReadinessComparisonRequest) -> ReadinessComparisonResult:
    """Compare deterministic readiness before and after product changes."""
    return comparison_service.compare_products(request.before, request.after)


@router.post("/improve", response_model=ImprovementResult)
def improve_product(request: ImprovementRequest) -> ImprovementResult:
    """Hand validated product data to the content-generation integration point."""
    return generation_service.improve_product(request)


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


@router.post("/evaluate", response_model=ReadinessJudgeResult)
def evaluate_product(product: Product) -> ReadinessJudgeResult:
    """Run the optional semantic judge independently of deterministic scoring."""
    try:
        return llm_judge_service.evaluate_product_readiness(product)
    except llm_judge_service.LLMJudgeError:
        raise HTTPException(status_code=503, detail="LLM evaluation unavailable") from None


@router.post("/analyze", response_model=AnalysisResult)
def analyze_product(product: Product) -> AnalysisResult:
    """Return deterministic scoring with an optional semantic evaluation."""
    deterministic = scoring_service.score_product(product)
    try:
        evaluation = llm_judge_service.evaluate_product_readiness(product)
    except llm_judge_service.LLMJudgeError:
        return AnalysisResult(
            deterministic_score=deterministic,
            llm_evaluation_available=False,
        )
    return AnalysisResult(
        deterministic_score=deterministic,
        llm_evaluation_available=True,
        llm_evaluation=evaluation,
    )
