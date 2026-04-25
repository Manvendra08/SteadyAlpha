"""
Regime Engine — Market state assessment with hysteresis.

Classifies the broad market into one of four states:
BULLISH, BEARISH, RANGE, VOLATILE.

Uses a composite Z-score with a ±0.5 threshold and
a 2-day confirmation gate to prevent whipsaw transitions.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional


class RegimeState(Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    RANGE = "range"
    VOLATILE = "volatile"


@dataclass
class RegimeResult:
    state: RegimeState
    score: float
    confirmation_days: int
    previous_state: RegimeState
    changed: bool


# Thresholds
BULL_THRESHOLD = 0.5
BEAR_THRESHOLD = -0.5
HYSTERESIS_DAYS = 2


def compute_regime(
    current_score: float,
    previous_state: RegimeState,
    consecutive_days_above: int,
    consecutive_days_below: int,
) -> RegimeResult:
    """
    Determine current regime with hysteresis gate.

    Args:
        current_score: Composite Z-score for the broad market.
        previous_state: The regime state from the prior run.
        consecutive_days_above: Days the score has been > BULL_THRESHOLD.
        consecutive_days_below: Days the score has been < BEAR_THRESHOLD.

    Returns:
        RegimeResult with the new state and diagnostics.
    """
    new_state = previous_state
    changed = False

    if current_score > BULL_THRESHOLD:
        consecutive_days_above += 1
        consecutive_days_below = 0
        if consecutive_days_above >= HYSTERESIS_DAYS:
            new_state = RegimeState.BULLISH
    elif current_score < BEAR_THRESHOLD:
        consecutive_days_below += 1
        consecutive_days_above = 0
        if consecutive_days_below >= HYSTERESIS_DAYS:
            new_state = RegimeState.BEARISH
    else:
        # Dead zone — maintain current state, reset counters
        consecutive_days_above = 0
        consecutive_days_below = 0
        # If we were transitioning but fell back, stay put
        if previous_state in (RegimeState.BULLISH, RegimeState.BEARISH):
            new_state = RegimeState.RANGE

    changed = new_state != previous_state

    return RegimeResult(
        state=new_state,
        score=current_score,
        confirmation_days=max(consecutive_days_above, consecutive_days_below),
        previous_state=previous_state,
        changed=changed,
    )
