"""Contracts for Person B's content-generation pipeline."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.product import Product
from app.models.scoring import ScoringResult


def _empty(value: Any) -> bool:
    if value is None or isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict, set, tuple)):
        return not value
    if isinstance(value, BaseModel):
        return all(_empty(item) for item in value.model_dump().values())
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
            if not _empty(original):
                raise ValueError(f"generated content cannot overwrite populated field: {name}")
            changed.add(name)

        declared = set(self.generated_fields)
        unknown = declared - set(Product.model_fields)
        if unknown:
            raise ValueError(f"generated_fields contains unknown fields: {sorted(unknown)}")
        if changed != declared:
            raise ValueError("generated_fields must exactly identify changed product fields")
        return self
