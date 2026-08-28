"""Canonical product models shared across the application."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator


NonNegativePrice = Annotated[FiniteFloat, Field(ge=0)]

PRODUCT_SCHEMA_VERSION = "1.0.0"
SUPPORTED_PRODUCT_SECTIONS = (
    "identity",
    "core_attributes",
    "use_cases",
    "target_personas",
    "comparisons",
    "claims_and_evidence",
    "constraints_handled",
    "storytelling",
)


class ProductModel(BaseModel):
    """Common configuration for canonical product models."""

    model_config = ConfigDict(extra="forbid")


class UseCase(ProductModel):
    name: str
    description: str
    conditions: list[str] = Field(default_factory=list)


class TargetPersona(ProductModel):
    name: str
    description: str
    priorities: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class Comparison(ProductModel):
    alternative: str
    advantages: list[str] = Field(default_factory=list)
    disadvantages: list[str] = Field(default_factory=list)
    evidence: str | None = None


class Claim(ProductModel):
    claim: str
    evidence: str | None = None
    source: str | None = None


class HandledConstraints(ProductModel):
    """Shopping constraints explicitly satisfied by the product."""

    budget: list[str] = Field(default_factory=list)
    climate: list[str] = Field(default_factory=list)
    geography: list[str] = Field(default_factory=list)
    time: list[str] = Field(default_factory=list)
    compatibility: list[str] = Field(default_factory=list)
    accessibility: list[str] = Field(default_factory=list)
    other: dict[str, list[str]] = Field(default_factory=dict)


class Product(ProductModel):
    """Canonical AI-ready representation of a commerce product."""

    product_id: str | None = None
    title: str
    brand: str | None = None
    category: str | None = None
    description: str | None = None

    specifications: dict[str, str] = Field(default_factory=dict)
    materials: list[str] = Field(default_factory=list)
    dimensions: str | dict[str, str] | None = None
    price: NonNegativePrice | None = None
    currency: str | None = None
    availability: str | None = None

    use_cases: list[UseCase] = Field(default_factory=list)
    target_personas: list[TargetPersona] = Field(default_factory=list)
    comparisons: list[Comparison] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    constraints_handled: HandledConstraints = Field(default_factory=HandledConstraints)

    narrative: str | None = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value
