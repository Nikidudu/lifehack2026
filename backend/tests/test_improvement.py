import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.improvement import ImprovementResult
from app.models.product import Product
from app.services.scoring import score_product


client = TestClient(app)


def request_payload(product: Product) -> dict[str, object]:
    return {
        "product": product.model_dump(mode="json"),
        "score": score_product(product).model_dump(mode="json"),
    }


def test_improve_without_api_key_returns_product_unchanged(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    product = Product(title="Known product", brand="Known brand")

    response = client.post("/api/v1/improve", json=request_payload(product))

    assert response.status_code == 200
    body = response.json()
    assert body["original_product"] == product.model_dump(mode="json")
    assert body["improved_product"] == product.model_dump(mode="json")
    assert body["generated_fields"] == []
    assert body["warnings"] == [
        "OPENAI_API_KEY is not configured; product returned unchanged."
    ]


def test_improve_request_requires_product_and_score() -> None:
    assert client.post("/api/v1/improve", json={}).status_code == 422
    assert client.post(
        "/api/v1/improve",
        json={"product": {"title": "Product"}},
    ).status_code == 422


def test_contract_allows_declared_fill_of_empty_field() -> None:
    original = Product(title="Product")
    improved = Product(title="Product", category="Running shoes")

    result = ImprovementResult(
        original_product=original,
        improved_product=improved,
        generated_fields=["category"],
    )

    assert result.improved_product.category == "Running shoes"


def test_contract_rejects_overwrite_of_known_fact() -> None:
    with pytest.raises(ValidationError, match="cannot overwrite populated field: brand"):
        ImprovementResult(
            original_product=Product(title="Product", brand="Known brand"),
            improved_product=Product(title="Product", brand="Replacement brand"),
            generated_fields=["brand"],
        )


def test_contract_rejects_silent_unreported_change() -> None:
    with pytest.raises(ValidationError, match="must exactly identify changed"):
        ImprovementResult(
            original_product=Product(title="Product"),
            improved_product=Product(title="Product", category="Running shoes"),
            generated_fields=[],
        )


def test_contract_rejects_unknown_generated_field() -> None:
    with pytest.raises(ValidationError, match="unknown fields"):
        ImprovementResult(
            original_product=Product(title="Product"),
            improved_product=Product(title="Product"),
            generated_fields=["invented_field"],
        )
