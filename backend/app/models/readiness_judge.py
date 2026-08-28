"""Structured result produced by the optional semantic readiness judge."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


PercentageScore = Annotated[int, Field(ge=0, le=100)]
ConfidenceScore = Annotated[float, Field(ge=0, le=1)]


class ReadinessJudgeResult(BaseModel):
    """Strict contract for semantic evaluation output."""

    model_config = ConfigDict(extra="forbid")

    semantic_score: PercentageScore
    grounding_score: PercentageScore
    specificity_score: PercentageScore
    reasoning_quality_score: PercentageScore
    unsupported_claims: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    confidence: ConfidenceScore
