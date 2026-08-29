from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import Product


class CatalogImportResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    products: list[Product]
    warnings: list[str] = Field(default_factory=list)


class BatchImprovementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    products: list[Product] = Field(min_length=1, max_length=50)


class FieldSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str
    value: Any


class ProductSuggestions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_index: int
    product_id: str | None
    title: str
    suggestions: list[FieldSuggestion]


class BatchImprovementResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    products: list[ProductSuggestions]
    warnings: list[str] = Field(default_factory=list)
