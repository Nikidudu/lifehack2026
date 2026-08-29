from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.product import Product
from app.models.scoring import ScoringResult


class CoachMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value.strip()


class CoachRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: Product
    score: ScoringResult
    messages: list[CoachMessage] = Field(default_factory=list, max_length=20)
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value.strip()


class CoachOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str
    updated_product_json: str


class CoachResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str
    updated_product: Product
    changed_fields: list[str] = Field(default_factory=list)
