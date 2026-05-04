"""
Promotion Engine — deterministic gating from advisor recommendation
to paper order intent.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class PromotionDecision:
    status: str  # pending | rejected
    requested_qty: int
    rejection_reason: Optional[str]
    risk_pct: float
    sizing_basis: dict


def evaluate_promotion(
    regime_state: str,
    recommendation: str,
    confidence: float,
    risk_halt: bool,
    risk_pct: float,
    paper_config: dict,
) -> PromotionDecision:
    """Apply strict phase-3 promotion gates and deterministic sizing."""
    tradable_regimes = paper_config.get("tradable_regimes", ["bullish", "bearish"])
    min_confidence = float(paper_config.get("min_confidence", 60.0))
    require_risk_halt_false = bool(paper_config.get("require_risk_halt_false", True))

    is_long = "LONG" in recommendation or "PAPER_ELIGIBLE" in recommendation
    is_short = "SHORT" in recommendation
    
    if not (is_long or is_short):
        return PromotionDecision(
            status="rejected",
            requested_qty=0,
            rejection_reason="advisor_no_trade",
            risk_pct=risk_pct,
            sizing_basis={"reason": "advisor recommendation is NO_TRADE"},
        )

    if regime_state not in tradable_regimes:
        return PromotionDecision(
            status="rejected",
            requested_qty=0,
            rejection_reason="regime_not_tradable",
            risk_pct=risk_pct,
            sizing_basis={
                "regime_state": regime_state,
                "allowed_regimes": tradable_regimes,
            },
        )

    if confidence < min_confidence:
        return PromotionDecision(
            status="rejected",
            requested_qty=0,
            rejection_reason="confidence_below_threshold",
            risk_pct=risk_pct,
            sizing_basis={
                "confidence": confidence,
                "min_confidence": min_confidence,
            },
        )

    if require_risk_halt_false and risk_halt:
        return PromotionDecision(
            status="rejected",
            requested_qty=0,
            rejection_reason="risk_halt_active",
            risk_pct=risk_pct,
            sizing_basis={"risk_halt": risk_halt},
        )

    reference_capital = float(paper_config.get("reference_capital", 1_000_000.0))
    assumed_entry_price = float(paper_config.get("assumed_entry_price", 100.0))
    stop_loss_pct = float(paper_config.get("stop_loss_pct", 1.5))

    risk_amount = reference_capital * (risk_pct / 100.0)
    per_unit_risk = max(assumed_entry_price * (stop_loss_pct / 100.0), 0.01)
    requested_qty = max(1, int(risk_amount / per_unit_risk))

    return PromotionDecision(
        status="pending",
        requested_qty=requested_qty,
        rejection_reason=None,
        risk_pct=risk_pct,
        sizing_basis={
            "formula": "qty = floor((capital * risk_pct) / (entry_price * stop_loss_pct))",
            "reference_capital": reference_capital,
            "risk_pct": risk_pct,
            "assumed_entry_price": assumed_entry_price,
            "stop_loss_pct": stop_loss_pct,
            "per_unit_risk": per_unit_risk,
            "risk_amount": risk_amount,
        },
    )

