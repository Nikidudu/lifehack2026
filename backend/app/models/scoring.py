"""Structured output models for deterministic readiness scoring."""

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import Product
from app.models.readiness_judge import ReadinessJudgeResult


class DimensionScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=0)
    max_score: int = Field(gt=0)
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class ScoringResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_score: int = Field(ge=0, le=100)
    readiness_level: str
    dimensions: dict[str, DimensionScore]
    missing_fields: list[str] = Field(default_factory=list)
    critical_issues: list[str] = Field(default_factory=list)
    top_recommendations: list[str] = Field(default_factory=list)


class SchemaMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str
    scoring_version: str
    supported_sections: list[str]
    scoring_dimensions: dict[str, int]
    total_maximum_score: int = Field(ge=0)


class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deterministic_score: ScoringResult
    llm_evaluation_available: bool
    llm_evaluation: ReadinessJudgeResult | None = None


class ReadinessComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    before: Product
    after: Product


class ReadinessComparisonResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    before_score: ScoringResult
    after_score: ScoringResult
    score_change: int
    improved_dimensions: list[str] = Field(default_factory=list)
    regressed_dimensions: list[str] = Field(default_factory=list)
    newly_completed_fields: list[str] = Field(default_factory=list)
    remaining_issues: list[str] = Field(default_factory=list)
