from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.coach import CoachOutput, CoachRequest
from app.models.product import Product
from app.services import coach
from app.services.scoring import score_product


client = TestClient(app)


def request_for(product: Product, message: str = "It is intended for commuters") -> CoachRequest:
    return CoachRequest(product=product, score=score_product(product), message=message)


def test_gpt_coach_returns_message_and_validated_product(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Watch")
    updated = Product(
        title="Watch", use_cases=[{"name": "Commuting", "description": "Intended for commuters", "conditions": ["Daily travel"]}],
    )
    output = CoachOutput(message="What price range should I consider?", updated_product_json=updated.model_dump_json())
    api = SimpleNamespace(responses=SimpleNamespace(parse=lambda **kwargs: SimpleNamespace(output_parsed=output)))

    result = coach.chat(request_for(product), client=api)

    assert result.message.endswith("?")
    assert result.changed_fields == ["use_cases"]
    assert result.updated_product.use_cases[0].name == "Commuting"


def test_gpt_coach_requires_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(coach.CoachUnavailableError):
        coach.chat(request_for(Product(title="Watch")))


def test_coach_api_hides_provider_failure(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes.coach_service.chat", lambda request: (_ for _ in ()).throw(coach.CoachUnavailableError("secret")))
    product = Product(title="Watch")
    response = client.post("/api/v1/coach", json={
        "product": product.model_dump(mode="json"),
        "score": score_product(product).model_dump(mode="json"),
        "messages": [], "message": "Ask me a question",
    })
    assert response.status_code == 503
    assert response.json() == {"detail": "AI coach unavailable"}


def test_coach_rejects_blank_message() -> None:
    product = Product(title="Watch")
    response = client.post("/api/v1/coach", json={
        "product": product.model_dump(mode="json"),
        "score": score_product(product).model_dump(mode="json"),
        "messages": [], "message": "   ",
    })
    assert response.status_code == 422
