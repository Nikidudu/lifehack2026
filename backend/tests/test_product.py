import json

import pytest
from pydantic import ValidationError

from app.models.product import Product


def test_minimal_valid_product() -> None:
    product = Product(title="Everyday Backpack")

    assert product.title == "Everyday Backpack"
    assert product.specifications == {}
    assert product.materials == []
    assert product.use_cases == []
    assert product.constraints_handled.budget == []


def test_fully_populated_product() -> None:
    product = Product.model_validate(
        {
            "product_id": "shoe-001",
            "title": "Breeze Runner 2",
            "brand": "Example Athletics",
            "category": "Running shoes",
            "description": "A lightweight road-running shoe.",
            "specifications": {"weight": "240 g", "drop": "8 mm"},
            "materials": ["Recycled mesh", "Rubber"],
            "dimensions": {"size_range": "EU 36-47"},
            "price": 179.9,
            "currency": "SGD",
            "availability": "In stock",
            "use_cases": [
                {
                    "name": "Humid-weather training",
                    "description": "Daily road training in warm, humid weather.",
                    "conditions": ["High humidity", "Road surfaces"],
                }
            ],
            "target_personas": [
                {
                    "name": "Recreational runner",
                    "description": "A runner preparing for a first half marathon.",
                    "priorities": ["Breathability", "Low weight"],
                    "constraints": ["Budget under S$200"],
                }
            ],
            "comparisons": [
                {
                    "alternative": "Traditional stability shoe",
                    "advantages": ["Lighter upper"],
                    "disadvantages": ["Less stability support"],
                    "evidence": "Manufacturer weight specifications",
                }
            ],
            "claims": [
                {
                    "claim": "Upper contains recycled material",
                    "evidence": "Material composition report",
                    "source": "https://example.com/material-report",
                }
            ],
            "constraints_handled": {
                "budget": ["Under S$200"],
                "climate": ["Hot and humid"],
                "geography": ["Singapore"],
                "time": ["Daily training"],
                "compatibility": ["Road running"],
                "accessibility": ["Wide sizes available"],
                "other": {"experience_level": ["Beginner", "Intermediate"]},
            },
            "narrative": "Built for runners who train through tropical weather.",
        }
    )

    assert product.price == 179.9
    assert product.use_cases[0].conditions == ["High humidity", "Road surfaces"]
    assert product.claims[0].evidence == "Material composition report"


def test_blank_title_is_rejected() -> None:
    with pytest.raises(ValidationError, match="title must not be blank"):
        Product(title="   ")


@pytest.mark.parametrize("price", [-0.01, "not-a-price", float("nan"), float("inf")])
def test_invalid_price_is_rejected(price: object) -> None:
    with pytest.raises(ValidationError):
        Product(title="Valid title", price=price)


def test_missing_optional_fields_receive_safe_defaults() -> None:
    first = Product(title="First")
    second = Product(title="Second")

    first.materials.append("Cotton")
    first.constraints_handled.other["care"] = ["Machine washable"]

    assert second.product_id is None
    assert second.price is None
    assert second.materials == []
    assert second.constraints_handled.other == {}


def test_json_serialization_and_deserialization() -> None:
    original = Product(
        title="Desk Lamp",
        specifications={"power": "8 W"},
        price=49.5,
        currency="SGD",
    )

    serialized = original.model_dump_json()
    restored = Product.model_validate_json(serialized)

    assert json.loads(serialized)["price"] == 49.5
    assert restored == original
