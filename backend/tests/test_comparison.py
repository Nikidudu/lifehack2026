from fastapi.testclient import TestClient

from app.main import app
from app.models.product import Product
from app.services.comparison import compare_products


client = TestClient(app)


def test_comparison_detects_improvements_and_completed_fields() -> None:
    before = Product(title="Product")
    after = Product(
        title="Product",
        brand="Brand",
        category="Shoes",
        specifications={"weight": "250 g"},
    )

    result = compare_products(before, after)

    assert result.score_change == 8
    assert result.improved_dimensions == ["core_information", "structured_attributes"]
    assert result.regressed_dimensions == []
    assert result.newly_completed_fields == ["brand", "category", "specifications"]
    assert result.remaining_issues


def test_comparison_detects_negative_change_and_regression() -> None:
    before = Product(title="Product", brand="Brand", category="Shoes", price=50, currency="SGD")
    after = Product(title="Product")

    result = compare_products(before, after)

    assert result.score_change == -10
    assert result.regressed_dimensions == ["core_information"]
    assert result.improved_dimensions == []


def test_comparison_is_deterministic() -> None:
    before = Product(title="Before")
    after = Product(title="After", description="Known description")

    assert compare_products(before, after) == compare_products(before, after)


def test_compare_api_returns_comparison() -> None:
    response = client.post(
        "/api/v1/compare",
        json={
            "before": {"title": "Product"},
            "after": {"title": "Product", "category": "Shoes"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["score_change"] == 3
    assert body["improved_dimensions"] == ["core_information"]
    assert body["newly_completed_fields"] == ["category"]


def test_compare_api_reports_negative_score_change() -> None:
    response = client.post(
        "/api/v1/compare",
        json={
            "before": {"title": "Product", "brand": "Brand", "category": "Shoes"},
            "after": {"title": "Product"},
        },
    )

    assert response.status_code == 200
    assert response.json()["score_change"] == -6
    assert response.json()["regressed_dimensions"] == ["core_information"]


def test_compare_api_validates_both_products() -> None:
    response = client.post(
        "/api/v1/compare",
        json={"before": {"title": "Product"}, "after": {}},
    )

    assert response.status_code == 422
