from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.models.batch import BatchImprovementRequest
from app.models.improvement import ProductEnrichment
from app.models.product import Product
from app.services.batch_generation import BatchEnrichment, BatchEnrichmentItem, suggest_products


client = TestClient(app)
DATABASE = Path(__file__).resolve().parents[2] / "lifeo.db"


def test_imports_lifeo_catalog() -> None:
    with DATABASE.open("rb") as database:
        response = client.post("/api/v1/catalog/import", files={"database": ("lifeo.db", database, "application/octet-stream")})
    assert response.status_code == 200
    body = response.json()
    assert len(body["products"]) == 24
    assert body["products"][0]["product_id"] == "mer-01"
    assert body["products"][0]["specifications"]["movement"] == "Hand-wound"
    assert body["products"][0]["currency"] is None


def test_rejects_non_sqlite_upload() -> None:
    response = client.post("/api/v1/catalog/import", files={"database": ("bad.db", b"not sqlite")})
    assert response.status_code == 422


def test_batch_suggestions_are_proposals_not_applied(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    original = Product(title="Watch A", description="Original")
    generated = BatchEnrichment(products=[BatchEnrichmentItem(
        product_index=0,
        description="Suggested rewrite",
        use_cases=[], target_personas=[], constraints_handled=None, narrative=None,
        comparisons=[{"alternative": "Watch B", "advantages": ["Lower listed price"], "disadvantages": [], "evidence": None}],
    )])
    api = SimpleNamespace(responses=SimpleNamespace(parse=lambda **kwargs: SimpleNamespace(output_parsed=generated)))

    result = suggest_products(BatchImprovementRequest(products=[original]), client=api)

    assert original.description == "Original"
    assert [item.field for item in result.products[0].suggestions] == ["description", "comparisons"]
    assert "unverified" in result.warnings[0]


def test_suggest_api_uses_isolated_service(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.routes.batch_generation.suggest_products",
        lambda request: {"products": [], "warnings": ["mocked"]},
    )
    response = client.post("/api/v1/suggest", json={"products": [{"title": "Watch"}]})
    assert response.status_code == 200
    assert response.json()["warnings"] == ["mocked"]
