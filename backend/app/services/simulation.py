"""Person D integration point for shopping-query simulation."""

from app.models.simulation import (
    SimulationQueryResult,
    SimulationRequest,
    SimulationResult,
)


def simulate_queries(request: SimulationRequest) -> SimulationResult:
    """Placeholder: Person D should replace this body with their simulator."""
    # ponytail: conservative no-match stub; replace when Person D's simulator is ready.
    results = [
        SimulationQueryResult(
            query=query,
            matched=False,
            confidence=0,
            reasoning="Simulation is not configured.",
            missing_information=["No simulation implementation is configured."],
        )
        for query in request.queries
    ]
    return SimulationResult(
        product_id=request.product.product_id,
        total_queries=len(results),
        matched_queries=0,
        match_rate=0,
        results=results,
    )
