import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.product import Product
from app.models.simulation import (
    SimulationQueryResult,
    SimulationRequest,
    SimulationResult,
)


client = TestClient(app)


def test_simulation_contract_accepts_consistent_result() -> None:
    result = SimulationResult(
        product_id="shoe-1",
        total_queries=1,
        matched_queries=1,
        match_rate=1,
        results=[
            SimulationQueryResult(
                query="Light shoes for humid weather",
                matched=True,
                confidence=0.8,
                reasoning="The supplied attributes address the query.",
                matched_attributes=["weight", "climate"],
                missing_information=[],
            )
        ],
    )

    assert result.match_rate == 1


def test_simulation_contract_rejects_inconsistent_totals() -> None:
    with pytest.raises(ValidationError, match="total_queries"):
        SimulationResult(
            product_id=None,
            total_queries=2,
            matched_queries=0,
            match_rate=0,
            results=[],
        )


def test_simulation_request_rejects_blank_or_empty_queries() -> None:
    with pytest.raises(ValidationError):
        SimulationRequest(product=Product(title="Product"), queries=[])
    with pytest.raises(ValidationError, match="blank"):
        SimulationRequest(product=Product(title="Product"), queries=["  "])


def test_simulate_api_returns_conservative_placeholder() -> None:
    response = client.post(
        "/api/v1/simulate",
        json={
            "product": {"product_id": "shoe-1", "title": "Product"},
            "queries": ["Shoes for humid weather", "Shoes under S$200"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["product_id"] == "shoe-1"
    assert body["total_queries"] == 2
    assert body["matched_queries"] == 0
    assert body["match_rate"] == 0
    assert all(result["matched"] is False for result in body["results"])
    assert all(result["matched_attributes"] == [] for result in body["results"])


def test_simulate_api_validates_contract() -> None:
    assert client.post(
        "/api/v1/simulate",
        json={"product": {"title": "Product"}, "queries": []},
    ).status_code == 422
    assert client.post(
        "/api/v1/simulate",
        json={"product": {}, "queries": ["A query"]},
    ).status_code == 422
