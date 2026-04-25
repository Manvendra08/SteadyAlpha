"""
Advisor Engine — Weighted voting synthesis of engine outputs.

Produces an action recommendation (LONG, SHORT, NO_TRADE) with
a confidence score and list of reasoning factors.
"""

from dataclasses import dataclass


@dataclass
class AdvisorResult:
    recommendation: str  # LONG | SHORT | NO_TRADE
    confidence: float    # 0-100
    reasoning: list[str]


def compute_advice(
    regime_state: str,
    regime_changed: bool,
    flows_bias: str,
    pcr_percentile: float,
) -> AdvisorResult:
    """
    Synthesize engine outputs into a directional recommendation.

    Weights:
      - Regime state: 40%
      - Flows bias: 30%
      - PCR signal: 30%

    Rules:
      - NO_TRADE if regime is RANGE or VOLATILE
      - NO_TRADE if regime just changed (wait for confirmation)
      - LONG if regime BULLISH + flows bullish
      - SHORT if regime BEARISH + flows bearish
    """
    reasoning: list[str] = []
    score = 0.0

    # Regime contribution (40%)
    if regime_state == "bullish":
        score += 40
        reasoning.append("Regime BULLISH — directional conviction present")
    elif regime_state == "bearish":
        score -= 40
        reasoning.append("Regime BEARISH — directional conviction present")
    else:
        reasoning.append(f"Regime {regime_state.upper()} — no directional conviction")

    if regime_changed:
        score *= 0.5
        reasoning.append("Regime just changed — halving conviction (wait for confirmation)")

    # Flows contribution (30%)
    if flows_bias == "bullish":
        score += 30
        reasoning.append("Flows bullish — institutional support detected")
    elif flows_bias == "bearish":
        score -= 30
        reasoning.append("Flows bearish — institutional selling pressure")
    else:
        reasoning.append("Flows neutral — no institutional edge")

    # PCR contribution (30%)
    if pcr_percentile > 70:
        score += 15
        reasoning.append(f"PCR {pcr_percentile:.0f}th %ile — contrarian bullish")
    elif pcr_percentile < 30:
        score -= 15
        reasoning.append(f"PCR {pcr_percentile:.0f}th %ile — contrarian bearish")

    # Decision
    if regime_state in ("range", "volatile"):
        return AdvisorResult(
            recommendation="NO_TRADE",
            confidence=abs(score),
            reasoning=reasoning,
        )

    if score > 30:
        rec = "LONG"
    elif score < -30:
        rec = "SHORT"
    else:
        rec = "NO_TRADE"

    return AdvisorResult(
        recommendation=rec,
        confidence=min(abs(score), 100),
        reasoning=reasoning,
    )
