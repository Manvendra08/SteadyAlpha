# Phase 1: Data Reliability & Signal Engines - Research

## Objective
Research implementation details for the core signal engines and data validation strategies.

## 1. RS (Relative Strength) Slope & Ranking
### Relative Strength (RS)
- **Formula:** `RS(Stock, Benchmark) = Price(Stock) / Price(Benchmark)`
- **Benchmark:** Nifty 50 (or similar broad index).

### RS Slope (Linear Regression)
- **Method:** Use `numpy.polyfit` for a 20-day rolling window.
- **Formula:** $y = mx + c$, where $m$ is the slope.
- **Why 20-day:** Captures short-to-medium term momentum aligned with positional trading.

### Z-Score Normalization
- **Formula:** $Z = (x - \mu) / \sigma$
- **Universe:** F&O 200 stocks.
- **Ranking:** Sort by Z-score of RS Slope. Standardizes momentum regardless of market volatility.

## 2. Market Regime Hysteresis Gate
### Objective
Prevent rapid toggling (whipsaws) between Bullish and Bearish states.

### Logic
- **Indicator:** Use a composite score (e.g., Nifty 500 RS Slope Z-score).
- **Upper Threshold (Bullish):** +0.5
- **Lower Threshold (Bearish):** -0.5
- **Gate:**
  - Transition to BULL if Score > +0.5 AND remains > +0.5 for 2 days.
  - Transition to BEAR if Score < -0.5 AND remains < -0.5 for 2 days.
  - Otherwise, maintain current state.

## 3. Database Schema
### Table: `engine_audit`
- `run_id` (UUID, FK to `run_registry`)
- `engine_name` (text: regime, flows, leadership)
- `input_digest` (text: hash of inputs for repeatability)
- `output_digest` (text: hash of outputs)
- `diagnostics` (jsonb: internal state, intermediate values)

### Table: `signals_summary`
- `run_id` (UUID, FK)
- `regime_state` (text)
- `flows_bias` (text)
- `top_leaders` (jsonb array of symbols)
- `advisor_sentiment` (text)
- `last_run_ts` (timestamptz)

## 4. Technical Stack (Python)
- **Pandas:** Data manipulation and rolling windows.
- **SciPy:** `stats.zscore` for normalization.
- **NumPy:** `polyfit` for regressions.
- **Supabase-py:** Database interaction.

---
*Research complete: 2026-04-25*
