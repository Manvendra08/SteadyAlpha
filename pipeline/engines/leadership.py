"""
Leadership Engine — RS Slope ranking of F&O 200 universe.

Ranks stocks by Z-score normalized Relative Strength slope
over a 20-day window. Leaders have positive momentum relative
to the benchmark; laggards have negative.
"""

from dataclasses import dataclass
import numpy as np


@dataclass
class StockScore:
    symbol: str
    rs_slope: float
    z_score: float
    rank: int


def compute_rs_series(
    stock_prices: list[float],
    benchmark_prices: list[float],
) -> list[float]:
    """
    Compute RS ratio series: Stock Price / Benchmark Price.
    Both lists must be the same length.
    """
    if len(stock_prices) != len(benchmark_prices):
        raise ValueError("Price series length mismatch")

    return [
        s / b if b != 0 else 0.0
        for s, b in zip(stock_prices, benchmark_prices)
    ]


def compute_rs_slope(rs_series: list[float], window: int = 20) -> float:
    """
    Compute the slope of the RS series over the trailing window
    using linear regression (numpy polyfit degree 1).
    """
    if len(rs_series) < window:
        return 0.0

    recent = rs_series[-window:]
    x = np.arange(window)
    coeffs = np.polyfit(x, recent, 1)
    return float(coeffs[0])  # slope


def rank_universe(
    universe: dict[str, list[float]],
    benchmark_prices: list[float],
    window: int = 20,
) -> list[StockScore]:
    """
    Rank all stocks in the universe by Z-score of RS Slope.

    Args:
        universe: Dict of symbol -> price series.
        benchmark_prices: Benchmark (Nifty 50) price series.
        window: Rolling window for RS slope calculation.

    Returns:
        List of StockScore sorted by Z-score descending (rank 1 = strongest).
    """
    slopes: list[tuple[str, float]] = []

    for symbol, prices in universe.items():
        if len(prices) < window or len(benchmark_prices) < window:
            continue
        # Align lengths
        min_len = min(len(prices), len(benchmark_prices))
        rs = compute_rs_series(prices[-min_len:], benchmark_prices[-min_len:])
        slope = compute_rs_slope(rs, window)
        slopes.append((symbol, slope))

    if not slopes:
        return []

    symbols = [s[0] for s in slopes]
    slope_values = np.array([s[1] for s in slopes])

    # Z-score normalization (manual — no scipy dependency)
    if len(slope_values) > 1:
        mean = np.mean(slope_values)
        std = np.std(slope_values, ddof=0)
        if std > 0:
            z_scores = (slope_values - mean) / std
        else:
            z_scores = np.zeros_like(slope_values)
    else:
        z_scores = np.array([0.0])

    # Build ranked list
    scored = [
        StockScore(
            symbol=symbols[i],
            rs_slope=float(slope_values[i]),
            z_score=float(z_scores[i]),
            rank=0,
        )
        for i in range(len(symbols))
    ]

    # Sort descending by z_score
    scored.sort(key=lambda s: s.z_score, reverse=True)

    # Assign ranks
    for i, s in enumerate(scored):
        s.rank = i + 1

    return scored
