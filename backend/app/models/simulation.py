"""Contracts for Person D's shopping-query simulation pipeline."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.product import Product


Confidence = Annotated[float, Field(ge=0, le=1)]


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product: Product
    queries: list[str] = Field(min_length=1)

    @field_validator("queries")
    @classmethod
    def queries_must_not_be_blank(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("queries must not contain blank values")
        return [value.strip() for value in values]


class SimulationQueryResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    matched: bool
    confidence: Confidence
    reasoning: str
    matched_attributes: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str | None
    total_queries: int = Field(ge=0)
    matched_queries: int = Field(ge=0)
    match_rate: Confidence
    results: list[SimulationQueryResult]

    @model_validator(mode="after")
    def totals_must_match_results(self) -> "SimulationResult":
        matched = sum(result.matched for result in self.results)
        rate = matched / len(self.results) if self.results else 0
        if self.total_queries != len(self.results):
            raise ValueError("total_queries must equal the number of results")
        if self.matched_queries != matched:
            raise ValueError("matched_queries must equal matched results")
        if abs(self.match_rate - rate) > 1e-9:
            raise ValueError("match_rate must equal matched_queries / total_queries")
        return self
