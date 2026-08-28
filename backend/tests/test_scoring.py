from app.models.product import Product
from app.services.scoring import (
    DIMENSION_MAX_SCORES,
    score_claims_and_evidence,
    score_constraint_coverage,
    score_persona_coverage,
    score_product,
    score_use_case_coverage,
)


def complete_product() -> Product:
    return Product.model_validate(
        {
            "product_id": "product-001",
            "title": "Breeze Runner 2",
            "brand": "Example Athletics",
            "category": "Running shoes",
            "description": "A lightweight road-running shoe.",
            "specifications": {
                "weight": "240 g",
                "drop": "8 mm",
                "closure": "Laces",
                "cushioning": "Medium",
            },
            "materials": ["Recycled mesh", "Rubber"],
            "dimensions": {"size_range": "EU 36-47"},
            "price": 179.9,
            "currency": "SGD",
            "availability": "In stock",
            "use_cases": [
                {
                    "name": f"Use case {index}",
                    "description": "A specific supported usage scenario.",
                    "conditions": ["Condition A", "Condition B"],
                }
                for index in range(1, 4)
            ],
            "target_personas": [
                {
                    "name": f"Persona {index}",
                    "description": "A clearly defined customer segment.",
                    "priorities": ["Low weight"],
                    "constraints": ["Budget under S$200"],
                }
                for index in range(1, 4)
            ],
            "comparisons": [
                {
                    "alternative": f"Alternative {index}",
                    "advantages": ["Lower weight"],
                    "disadvantages": ["Less stability support"],
                    "evidence": "Published product specification sheet",
                }
                for index in range(1, 3)
            ],
            "claims": [
                {
                    "claim": f"Supported claim {index}",
                    "evidence": "Documented test or material report",
                    "source": f"https://example.com/evidence/{index}",
                }
                for index in range(1, 4)
            ],
            "constraints_handled": {
                "budget": ["Under S$200"],
                "climate": ["Hot and humid"],
                "geography": ["Singapore"],
                "time": ["Daily use"],
                "compatibility": ["Road running"],
                "accessibility": ["Wide sizes available"],
                "other": {
                    "experience_level": ["Beginner"],
                    "maintenance": ["Hand washable"],
                },
            },
            "narrative": (
                "Designed for recreational runners training in tropical cities, this product combines documented "
                "materials and practical features with clear use guidance for everyday road sessions."
            ),
        }
    )


def test_completely_minimal_product_scores_three() -> None:
    result = score_product(Product(title="Minimal product"))

    assert result.total_score == 3
    assert result.readiness_level == "Not AI-Ready"
    assert "category" in result.missing_fields
    assert result.top_recommendations


def test_sparse_product_receives_only_documented_credit() -> None:
    product = Product(
        title="Basic shoe",
        category="Shoes",
        specifications={"weight": "300 g"},
        materials=["Mesh"],
        price=50,
    )

    result = score_product(product)

    assert result.dimensions["core_information"].score == 9
    assert result.dimensions["structured_attributes"].score == 4
    assert result.total_score == 13


def test_complete_product_scores_one_hundred() -> None:
    result = score_product(complete_product())

    assert result.total_score == 100
    assert result.readiness_level == "Highly AI-Ready"
    assert all(item.score == item.max_score for item in result.dimensions.values())
    assert result.missing_fields == []
    assert result.critical_issues == []


def test_unsupported_claim_is_identified_and_scores_one_point() -> None:
    product = Product(
        title="Claimed product",
        claims=[{"claim": "The world's most sustainable shoe"}],
    )

    evaluation = score_claims_and_evidence(product)
    result = score_product(product)

    assert evaluation.result.score == 1
    assert any("unsupported" in issue for issue in evaluation.result.issues)
    assert any("unsupported" in issue for issue in result.critical_issues)
    assert any("attach specific substantiation" in item for item in evaluation.result.suggestions)


def test_claim_with_evidence_and_source_scores_full_credit() -> None:
    product = Product(
        title="Documented product",
        claims=[
            {
                "claim": "Upper contains recycled polyester",
                "evidence": "Material composition report",
                "source": "https://example.com/report",
            }
        ],
    )

    evaluation = score_claims_and_evidence(product)

    assert evaluation.result.score == 5
    assert evaluation.critical_issues == []


def test_multiple_personas_score_independently() -> None:
    product = complete_product()

    evaluation = score_persona_coverage(product)

    assert evaluation.result.score == 12


def test_multiple_use_cases_score_independently() -> None:
    product = complete_product()

    evaluation = score_use_case_coverage(product)

    assert evaluation.result.score == 15


def test_constraint_categories_use_agreed_weights() -> None:
    product = Product.model_validate(
        {
            "title": "Constrained product",
            "constraints_handled": {
                "budget": ["Under S$100"],
                "climate": ["Humid"],
                "compatibility": ["iOS"],
                "other": {"skill_level": ["Beginner"]},
            },
        }
    )

    evaluation = score_constraint_coverage(product)

    assert evaluation.result.score == 6


def test_repeated_scoring_is_deterministic() -> None:
    product = complete_product()

    first = score_product(product)
    second = score_product(product)

    assert first == second
    assert first.model_dump_json() == second.model_dump_json()


def test_score_never_below_zero() -> None:
    result = score_product(Product(title="Minimum"))

    assert 0 <= result.total_score
    assert all(0 <= item.score for item in result.dimensions.values())


def test_score_never_above_one_hundred() -> None:
    product = complete_product()
    product.specifications.update({f"extra_{index}": "value" for index in range(20)})
    product.materials.extend([f"Material {index}" for index in range(20)])
    product.use_cases.extend(product.use_cases * 3)
    product.target_personas.extend(product.target_personas * 3)
    product.comparisons.extend(product.comparisons * 3)
    product.claims.extend(product.claims * 3)

    result = score_product(product)

    assert result.total_score == 100
    assert result.total_score <= 100


def test_dimensions_sum_exactly_to_total() -> None:
    for product in (Product(title="Minimum"), complete_product()):
        result = score_product(product)

        assert sum(item.score for item in result.dimensions.values()) == result.total_score
        assert sum(item.max_score for item in result.dimensions.values()) == 100
        assert dict(DIMENSION_MAX_SCORES) == {
            name: item.max_score for name, item in result.dimensions.items()
        }
