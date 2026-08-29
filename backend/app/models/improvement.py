"""Contracts for Person B's content-generation pipeline."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.product import Comparison, HandledConstraints, Product, TargetPersona, UseCase
from app.models.scoring import ScoringResult


def is_empty(value: Any) -> bool:
    if value is None or isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict, set, tuple)):
        return not value
    if isinstance(value, BaseModel):
        return all(is_empty(item) for item in value.model_dump().values())
    return False


class ImprovementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product: Product
    score: ScoringResult


class ImprovementResult(BaseModel):
    """Fill-only result: populated product fields cannot be replaced."""

    model_config = ConfigDict(extra="forbid")

    original_product: Product
    improved_product: Product
    generated_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def generated_fields_must_be_fill_only(self) -> "ImprovementResult":
        # ponytail: top-level fill-only; add path-aware merging if nested augmentation is required.
        changed: set[str] = set()
        for name in Product.model_fields:
            original = getattr(self.original_product, name)
            improved = getattr(self.improved_product, name)
            if original == improved:
                continue
            if not is_empty(original):
                raise ValueError(f"generated content cannot overwrite populated field: {name}")
            changed.add(name)

        declared = set(self.generated_fields)
        unknown = declared - set(Product.model_fields)
        if unknown:
            raise ValueError(f"generated_fields contains unknown fields: {sorted(unknown)}")
        if changed != declared:
            raise ValueError("generated_fields must exactly identify changed product fields")
        return self


class ProductEnrichment(BaseModel):
    """Semantic fields the generator may propose without inventing hard facts."""

    model_config = ConfigDict(extra="forbid")

    description: str | None
    use_cases: list[UseCase]
    target_personas: list[TargetPersona]
    constraints_handled: GeneratedConstraints | None
    narrative: str | None
    comparisons: list[Comparison] = Field(default_factory=list)


class GeneratedConstraints(BaseModel):
    """Fixed-key constraint output compatible with strict structured generation."""

    model_config = ConfigDict(extra="forbid")

    budget: list[str]
    climate: list[str]
    geography: list[str]
    time: list[str]
    compatibility: list[str]
    accessibility: list[str]


ProductEnrichment.model_rebuild()
