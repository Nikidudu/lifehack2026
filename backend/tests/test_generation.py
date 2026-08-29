from types import SimpleNamespace
from unittest.mock import MagicMock

from openai import APITimeoutError

from app.models.improvement import ImprovementRequest, ProductEnrichment
from app.models.product import Product
from app.services.generation import improve_product
from app.services.scoring import score_product


def request_for(product: Product) -> ImprovementRequest:
    return ImprovementRequest(product=product, score=score_product(product))


def enrichment(**updates) -> ProductEnrichment:
    values = {
        "description": None,
        "use_cases": [],
        "target_personas": [],
        "constraints_handled": None,
        "narrative": None,
    }
    values.update(updates)
    return ProductEnrichment(**values)


def test_generation_fills_only_missing_semantic_fields(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe", description="Known factual description")
    generated = enrichment(
        description="Attempted replacement",
        use_cases=[
            {
                "name": "Road running",
                "description": "Running on paved roads.",
                "conditions": ["Paved surfaces"],
            }
        ],
        narrative="A concise narrative based on supplied road-running information.",
    )
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(output_parsed=generated)

    result = improve_product(request_for(product), client=client)

    assert result.improved_product.description == "Known factual description"
    assert result.improved_product.use_cases == generated.use_cases
    assert result.improved_product.narrative == generated.narrative
    assert result.generated_fields == ["use_cases", "narrative"]
    request = client.responses.parse.call_args.kwargs
    assert request["text_format"] is ProductEnrichment
    assert request["store"] is False
    assert "test-key" not in str(request)


def test_generation_cannot_create_hard_factual_fields(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe")
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(
        output_parsed=enrichment(description="A road shoe described only from its title.")
    )

    result = improve_product(request_for(product), client=client)

    assert result.improved_product.price is None
    assert result.improved_product.specifications == {}
    assert result.improved_product.claims == []
    assert result.generated_fields == ["description"]


def test_generated_standard_constraints_convert_to_canonical_product(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe", price=100, currency="SGD")
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(
        output_parsed=enrichment(
            constraints_handled={
                "budget": ["Price supplied as SGD 100"],
                "climate": [],
                "geography": [],
                "time": [],
                "compatibility": [],
                "accessibility": [],
            }
        )
    )

    result = improve_product(request_for(product), client=client)

    assert result.improved_product.constraints_handled.budget == ["Price supplied as SGD 100"]
    assert result.improved_product.constraints_handled.other == {}


def test_generation_timeout_returns_safe_unchanged_result(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe")
    client = MagicMock()
    client.responses.parse.side_effect = APITimeoutError(request=MagicMock())

    result = improve_product(request_for(product), client=client)

    assert result.improved_product == product
    assert result.generated_fields == []
    assert result.warnings == ["Content generation failed; product returned unchanged."]


def test_malformed_generation_returns_safe_unchanged_result(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe")
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(output_parsed=None)

    result = improve_product(request_for(product), client=client)

    assert result.improved_product == product
    assert result.warnings == [
        "Content generation returned an invalid response; product returned unchanged."
    ]


def test_no_supported_generation_returns_unchanged_result(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    product = Product(title="Road Shoe")
    client = MagicMock()
    client.responses.parse.return_value = SimpleNamespace(output_parsed=enrichment())

    result = improve_product(request_for(product), client=client)

    assert result.improved_product == product
    assert result.warnings == ["No grounded semantic fields could be generated."]
