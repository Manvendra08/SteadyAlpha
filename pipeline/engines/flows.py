"""
Flows Engine — Institutional, Options, and Sector flow analysis.

Aggregates:
  - FII/DII net flows (buy - sell)
  - PCR (Put-Call Ratio) percentile ranking
  - Sector Relative Strength vs Nifty 50
"""

from dataclasses import dataclass
from typing import Optional
import numpy as np


@dataclass
class FlowsResult:
    fii_net: float
    dii_net: float
    institutional_bias: str  # "net_buy" | "net_sell" | "neutral"
    pcr_value: float
    pcr_percentile: float
    sector_rs: dict[str, float]  # sector_name -> RS value
    overall_bias: str  # "bullish" | "bearish" | "neutral"


def compute_institutional_bias(fii_net: float, dii_net: float) -> str:
    """Classify combined institutional flow direction."""
    combined = fii_net + dii_net
    if combined > 500:  # crore threshold
        return "net_buy"
    elif combined < -500:
        return "net_sell"
    return "neutral"


def compute_pcr_percentile(
    current_pcr: float,
    historical_pcr: list[float],
) -> float:
    """
    Rank current PCR against historical distribution.

    Returns percentile in 0-100 range.
    High percentile (>70) suggests excessive puts (potential support).
    Low percentile (<30) suggests excessive calls (potential resistance).
    """
    if not historical_pcr:
        return 50.0

    below = sum(1 for p in historical_pcr if p <= current_pcr)
    return round((below / len(historical_pcr)) * 100, 1)


def compute_sector_rs(
    sector_prices: dict[str, list[float]],
    benchmark_prices: list[float],
    window: int = 20,
) -> dict[str, float]:
    """
    Compute Relative Strength of each sector vs benchmark.

    RS = sector_return / benchmark_return over the window.
    """
    if len(benchmark_prices) < window:
        return {}

    benchmark_return = (
        (benchmark_prices[-1] - benchmark_prices[-window])
        / benchmark_prices[-window]
    )

    rs_map: dict[str, float] = {}
    for sector, prices in sector_prices.items():
        if len(prices) < window:
            continue
        sector_return = (prices[-1] - prices[-window]) / prices[-window]
        # Avoid division by zero
        if benchmark_return == 0:
            rs_map[sector] = 0.0
        else:
            rs_map[sector] = round(sector_return / benchmark_return, 4)

    return rs_map


def compute_flows(
    fii_net: float,
    dii_net: float,
    current_pcr: float,
    historical_pcr: list[float],
    sector_prices: dict[str, list[float]],
    benchmark_prices: list[float],
) -> FlowsResult:
    """Run the full Flows engine and return aggregated result."""
    inst_bias = compute_institutional_bias(fii_net, dii_net)
    pcr_pct = compute_pcr_percentile(current_pcr, historical_pcr)
    sector_rs = compute_sector_rs(sector_prices, benchmark_prices)

    # Derive overall bias from components
    bullish_signals = 0
    bearish_signals = 0

    if inst_bias == "net_buy":
        bullish_signals += 1
    elif inst_bias == "net_sell":
        bearish_signals += 1

    if pcr_pct > 70:
        bullish_signals += 1  # high PCR = contrarian bullish
    elif pcr_pct < 30:
        bearish_signals += 1

    if bullish_signals > bearish_signals:
        overall = "bullish"
    elif bearish_signals > bullish_signals:
        overall = "bearish"
    else:
        overall = "neutral"

    return FlowsResult(
        fii_net=fii_net,
        dii_net=dii_net,
        institutional_bias=inst_bias,
        pcr_value=current_pcr,
        pcr_percentile=pcr_pct,
        sector_rs=sector_rs,
        overall_bias=overall,
    )
