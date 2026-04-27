# Signal Engine & Dashboard — Technical Specification

**Version:** v0.4
**Phase:** Stage 1 — Data Reliability Layer
**Stack:** GitHub Actions (Compute) → Supabase (Storage/Realtime) → Vercel (UI)
**Trading Horizon:** Positional (Daily/Weekly trends, EOD-driven)

---

## Changelog

| Version | Date | Changes |
|:---|:---|:---|
| v0.1 | 2026-04-25 | Initial draft |
| v0.2 | 2026-04-25 | Bug fixes: sector-confirmation always-true, risk directional vote asymmetry, regime_confidence HIGH_VOL penalty, RANGE_BOUND band collapse. Undefined references resolved. Magic numbers moved to config. Persistence auditability fixes. Section 0, 7, 8 added. |
| v0.3 | 2026-04-26 | Spec first: Backtest methodology added, validation criteria added, engine logic clarified and strengthened, config defaults rationalized, implementation-agnostic redesign. |
| v0.4 | 2026-04-26 | ADX boundary fix, quintile naming corrected (Q1=top performers), regime confidence continuous scoring, FII lookback extended to 252d, backtest slippage added, asymmetric exits fixed, Z-score clipping added, sector rotation direction corrected. |

---

## 0. PURPOSE & SCOPE

### 0.1 What This System Does

SteadyAlpha is a rule-based signal engine that:
1. Classifies market regime (trending, range-bound, high-vol)
2. Evaluates institutional flows and sector rotation
3. Identifies leadership candidates from the F&O 200 universe
4. Sizes positions based on risk state and portfolio constraints
5. Aggregates signals into actionable recommendations

### 0.2 What This System Does NOT Do

- Predict prices
- Use machine learning (v0.4)
- Trade autonomously without human oversight
- Guarantee performance

### 0.3 Design Philosophy

**Rules over discretion.** Every decision follows explicit, auditable logic. No black boxes.
**Evidence before automation.** Signal quality must be validated before broker integration.
**Conservative sizing.** Preserve capital. Small wins compound; large losses don't.

---

## 1. DATA DICTIONARY & CONTRACTS

### 1.1 Timezone Policy
- All **market-logic thresholds** (session boundaries, staleness) use **IST (UTC+5:30)**.
- All **stored timestamps** (`run_ts`, `created_at`) use **UTC**.
- Market session: 09:15–15:30 IST. EOD data availability: ~16:30 IST.

### 1.2 run_id Contract
Every engine output carries the `run_id` from `run_registry` that produced it. No output is valid without a `run_id`. Engines are called sequentially within a single run.

### 1.3 Engine Execution Order
```
Regime → Flows → Leadership → Risk → Decision Aggregator
```
Each engine receives only previously-computed engine outputs as upstream inputs, never raw features from a downstream engine.

### 1.4 Shared Field Types
| Field | Type | Notes |
|:---|:---|:---|
| `run_id` | `uuid` | FK to `run_registry.run_id` |
| `engine_version` | `text` | Git SHA or semver of engine code |
| `run_ts` | `timestamptz` | UTC timestamp of pipeline execution |
| `regime` | `text` | One of the 6 regime states |
| `symbol` | `text` | NSE trading symbol |
| `sector` | `text` | NSE sector classification |

### 1.5 Data Freshness Rules
| Data Type | Stale Threshold | Fallback Behavior |
|:---|:---|:---|
| Nifty 50 EOD | > 1 trading day | Fail run, log error |
| India VIX | > 1 trading day | Use last known value, set percentile to null |
| F&O 200 prices | > 1 trading day | Fail run, log error |
| FII flows | > 2 trading days | Set FII components to 0, log warning |
| PCR OI | > 1 trading day | Skip PCR scoring, omit driver |
| Sector indices | > 1 trading day | Skip sector rotation scoring |

---

## 2. REGIME ENGINE

### 2.1 Purpose
Classify broad market structure and volatility state. Defines directional permissibility and baseline risk posture. Does **not** select stocks.

### 2.2 Inputs

| Metric | Source | Required | Calculation |
|:---|:---|:---|:---|
| `close` | Nifty 50 Daily | Yes | EOD close |
| `ema20` | Nifty 50 Daily | Yes | EMA(close, 20) |
| `ema50` | Nifty 50 Daily | Yes | EMA(close, 50) |
| `ema200` | Nifty 50 Daily | Yes | EMA(close, 200) |
| `ema20_prev` | Nifty 50 Daily | Yes | EMA20 from prior session |
| `ema50_prev` | Nifty 50 Daily | Yes | EMA50 from prior session |
| `adx_14` | Nifty 50 Daily | Yes | Wilder ADX(14) |
| `vix_value` | India VIX | Yes | Current close |
| `vix_percentile` | India VIX | Yes | 252-day rolling percentile of VIX close |
| `breadth_pct` | F&O 200 Universe | Yes | % of symbols whose close > SMA(close, 50) |
| `prev_regime` | State Store | Yes | Last confirmed regime |
| `prev_candidate_regime` | State Store | Yes | Last unconfirmed candidate regime |
| `prev_candidate_days` | State Store | Yes | Consecutive sessions current candidate has persisted |

### 2.3 trend_score Formula

`trend_score` is a composite in `[-10, +10]` built from three sub-components.

```python
def soft_cap(x: float, scale: float) -> float:
    """Normalise x to [-1, +1] using linear soft cap at ±scale."""
    return max(-1.0, min(1.0, x / scale))


def compute_trend_score(
    close, ema20, ema50, ema200, ema20_prev, ema50_prev,
    cfg
) -> float:
    """
    Returns trend_score in [-10, +10].
    Config keys (Section 10):
      regime.ts_d20_scale, regime.ts_d50_scale, regime.ts_d200_scale
      regime.ts_slope20_scale, regime.ts_slope50_scale
    """
    # --- Component 1: Price distance from EMAs (40% weight) ---
    d20  = (close - ema20)  / ema20
    d50  = (close - ema50)  / ema50
    d200 = (close - ema200) / ema200

    distance_score = (
        0.40 * soft_cap(d20,  cfg.ts_d20_scale)   +
        0.35 * soft_cap(d50,  cfg.ts_d50_scale)   +
        0.25 * soft_cap(d200, cfg.ts_d200_scale)
    )

    # --- Component 2: EMA alignment (35% weight) ---
    if ema20 > ema50 > ema200:
        alignment_score = 1.0
    elif ema20 < ema50 < ema200:
        alignment_score = -1.0
    elif ema20 > ema50 and ema50 < ema200:
        alignment_score = 0.33
    elif ema20 < ema50 and ema50 > ema200:
        alignment_score = -0.33
    else:
        alignment_score = 0.0

    # --- Component 3: EMA slopes (25% weight) ---
    slope20 = (ema20 - ema20_prev) / ema20_prev
    slope50 = (ema50 - ema50_prev) / ema50_prev

    slope_score = (
        0.60 * soft_cap(slope20, cfg.ts_slope20_scale) +
        0.40 * soft_cap(slope50, cfg.ts_slope50_scale)
    )

    # --- Composite ---
    raw = (
        0.40 * distance_score  +
        0.35 * alignment_score +
        0.25 * slope_score
    )
    return round(raw * 10, 2)
```

### 2.4 Regime States

```
TREND_UP           - Uptrend, normal vol
TREND_DOWN         - Downtrend, normal vol
TREND_UP_HIGH_VOL  - Uptrend, elevated vol
TREND_DOWN_HIGH_VOL- Downtrend, elevated vol
RANGE_BOUND        - No clear trend, low vol
TRANSITION         - Ambiguous / in flux
```

### 2.5 Base Classification

```python
def classify_regime(trend_score, adx_14, vix_value, vix_percentile, breadth_pct, cfg):
    high_vol = (
        vix_value       > cfg.high_vol_vix_abs and
        vix_percentile  > cfg.high_vol_vix_pct
    )

    # Uptrend: requires ALL three conditions
    if (
        adx_14 > cfg.min_adx_trend and                # FIXED: > not >= to prevent ADX=25 boundary collision
        trend_score >= cfg.min_trend_score and
        breadth_pct >= cfg.min_bullish_breadth
    ):
        return "TREND_UP_HIGH_VOL" if high_vol else "TREND_UP"

    # Downtrend: requires ALL three conditions
    if (
        adx_14 > cfg.min_adx_trend and
        trend_score <= -cfg.min_trend_score and
        breadth_pct <= cfg.max_bearish_breadth
    ):
        return "TREND_DOWN_HIGH_VOL" if high_vol else "TREND_DOWN"

    # Range-bound: ALL three conditions must hold
    if (
        adx_14 <= cfg.max_adx_range and               # FIXED: <= not < to close the gap
        abs(trend_score) < cfg.max_ts_range and
        cfg.range_breadth_low < breadth_pct < cfg.range_breadth_high
    ):
        return "RANGE_BOUND"

    # Explicit fallback: conditions are ambiguous or in conflict
    return "TRANSITION"
```

### 2.6 Confirmation / Hysteresis

```python
def apply_hysteresis(candidate_regime, prev_regime, prev_candidate_regime, prev_candidate_days, cfg):
    if candidate_regime == prev_regime:
        # No change; reset candidate state
        return candidate_regime, candidate_regime, 0

    if candidate_regime == prev_candidate_regime:
        # Same candidate persisting; increment counter
        candidate_days = prev_candidate_days + 1
        confirmed_regime = candidate_regime if candidate_days >= cfg.min_confirm_days else prev_regime
        return confirmed_regime, candidate_regime, candidate_days

    # New candidate; start count at 1
    return prev_regime, candidate_regime, 1
```

### 2.7 Confidence

```python
def compute_regime_confidence(regime, trend_score, adx_14, breadth_pct, vix_percentile, cfg):
    """
    FIXED: Continuous scoring instead of binary.
    Each component returns a value in [0, 1].
    """
    is_high_vol_regime = "HIGH_VOL" in regime
    is_bullish_regime = regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
    is_bearish_regime = regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]

    # Trend magnitude: normalize trend_score [-10, +10] to [0, 1]
    # For bullish regimes, higher positive score = higher confidence
    # For bearish regimes, lower negative score = higher confidence
    if is_bullish_regime:
        trend_component = min(abs(trend_score) / cfg.min_trend_score, 1.0) if trend_score > 0 else 0.0
    elif is_bearish_regime:
        trend_component = min(abs(trend_score) / cfg.min_trend_score, 1.0) if trend_score < 0 else 0.0
    else:
        trend_component = 0.0

    # ADX strength: normalize to [0, 1] above min_adx_trend
    strength_component = max(0.0, min((adx_14 - cfg.min_adx_trend) / 10.0, 1.0))

    # Breadth confirmation: how far above/below threshold
    if is_bullish_regime:
        breadth_component = min((breadth_pct - cfg.min_bullish_breadth) / 20.0, 1.0) if breadth_pct >= cfg.min_bullish_breadth else 0.0
    elif is_bearish_regime:
        breadth_component = min((cfg.max_bearish_breadth - breadth_pct) / 20.0, 1.0) if breadth_pct <= cfg.max_bearish_breadth else 0.0
    else:
        breadth_component = 0.0

    # Volatility alignment
    if is_high_vol_regime:
        vol_component = (vix_percentile - cfg.high_vol_vix_pct) / (100 - cfg.high_vol_vix_pct) if vix_percentile > cfg.high_vol_vix_pct else 0.0
    else:
        vol_component = (cfg.high_vol_vix_pct - vix_percentile) / cfg.high_vol_vix_pct if vix_percentile <= cfg.high_vol_vix_pct else 0.0

    components = {
        "trend": round(trend_component, 3),
        "strength": round(strength_component, 3),
        "breadth": round(breadth_component, 3),
        "volatility": round(vol_component, 3),
    }
    return round(sum(components.values()) / 4, 2)
```

### 2.8 Risk Posture Mapping

| Regime | Directional Bias | Base Risk Multiplier |
|:---|:---|:---:|
| `TREND_UP` | Long-only preferred | 1.00 |
| `TREND_DOWN` | Short-only preferred | 1.00 |
| `TREND_UP_HIGH_VOL` | Long-only selective | 0.60 |
| `TREND_DOWN_HIGH_VOL` | Short-only selective | 0.60 |
| `RANGE_BOUND` | No-trade preferred | 0.40 |
| `TRANSITION` | Reduce participation | 0.50 |

### 2.9 Output Schema

```json
{
  "run_id": "uuid",
  "engine_version": "text",
  "regime": "TREND_UP",
  "candidate_regime": "TREND_UP",
  "candidate_days": 0,
  "trend_score": 4.2,
  "adx_14": 28.5,
  "vix_value": 14.8,
  "vix_percentile": 32.1,
  "breadth_pct": 63.4,
  "regime_confidence": 0.75,
  "base_risk_multiplier": 1.0,
  "components": {
    "distance_score": 0.65,
    "alignment_score": 1.0,
    "slope_score": 0.42,
    "trend": 0.80,
    "strength": 0.35,
    "breadth": 0.70,
    "volatility": 0.85
  }
}
```

---

## 3. FLOWS ENGINE

### 3.1 Purpose
Evaluate whether institutional participation, options sentiment, and sector rotation confirm or oppose the regime. May strengthen, weaken, or neutralize directional conviction. Does **not** define trade size.

### 3.2 Inputs

| Metric | Source | Required | Calculation |
|:---|:---|:---|:---|
| `fii_5d_net` | NSE Cash | Yes | Sum of last 5 sessions (₹ Cr) |
| `fii_5d_z` | Derived | Yes | Z-score of `fii_5d_net` vs trailing **252 sessions** (FIXED: was 126) |
| `dii_5d_net` | NSE Cash | No | Sum of last 5 sessions |
| `pcr_oi` | NSE Option Chain | Yes | Put OI / Call OI |
| `pcr_oi_smooth` | Derived | Yes | EMA(PCR OI, 3) |
| `pcr_oi_percentile` | Derived | Yes | 252-day percentile of smoothed PCR |
| `sector_rs_slopes` | Sector indices | Yes | 20-day RS slope vs Nifty for each sector |
| `top_inflow_sectors` | Derived | Yes | Top 3 sectors by RS slope |
| `top_outflow_sectors` | Derived | Yes | Bottom 3 sectors by RS slope |
| `sector_rs_spread` | Derived | Yes | `max(sector_rs_slopes) - min(sector_rs_slopes)` |
| `delivery_score` | NSE Delivery | No | Delivery % vs 20d median |
| `regime` | Regime Engine | Yes | Confirmed regime |

### 3.3 Scoring Logic

```python
def compute_flows_score(fii_5d_z, pcr_oi_percentile, sector_rs_spread, regime, cfg):
    flows_score = 0.0
    drivers = []

    # --- FII Institutional Flows ---
    if fii_5d_z >= cfg.fii_z_strong:
        flows_score += 1.0
        drivers.append("FII_STRONG_LONG")
    elif fii_5d_z <= -cfg.fii_z_strong:
        flows_score -= 1.0
        drivers.append("FII_STRONG_SHORT")

    # --- Options Sentiment (Contrarian) ---
    # High PCR = many puts bought = bearish sentiment = contrarian bullish signal
    # Low PCR = many calls bought = bullish sentiment = contrarian bearish signal
    if pcr_oi_percentile >= cfg.pcr_high_pct:
        flows_score += 0.75
        drivers.append("PCR_CONTRARIAN_BULLISH")
    elif pcr_oi_percentile <= cfg.pcr_low_pct:
        flows_score -= 0.75
        drivers.append("PCR_CONTRARIAN_BEARISH")

    # --- Sector Rotation Confirmation ---
    # FIXED: Sector RS slope > 0 means sector outperforming = inflow
    # Top inflow sectors have HIGHEST RS slopes (positive = outperforming)
    # Top outflow sectors have LOWEST RS slopes (negative = underperforming)
    regime_aligned_long = regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
    regime_aligned_short = regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]
    rotation_meaningful = sector_rs_spread > cfg.min_sector_rs_spread

    if rotation_meaningful:
        if regime_aligned_long:
            # Look for Q5 leaders in sectors NOT in outflows (outperforming sectors)
            flows_score += 0.50
            drivers.append("SECTOR_ROTATION_LONG")
        elif regime_aligned_short:
            # Look for Q1 laggards in sectors NOT in inflows (underperforming sectors)
            flows_score -= 0.50
            drivers.append("SECTOR_ROTATION_SHORT")

    # --- Regime Guardrails ---
    # Flows cannot force directional action in neutral regimes
    if regime in ["RANGE_BOUND", "TRANSITION"]:
        flows_score *= 0.5
        drivers.append("REGIME_LIMITED")

    return flows_score, drivers
```

### 3.4 Bias Mapping

```python
def map_flows_bias(flows_score, cfg):
    if flows_score >= cfg.bias_threshold:
        return "LONG", flows_score
    elif flows_score <= -cfg.bias_threshold:
        return "SHORT", flows_score
    else:
        return "NEUTRAL", flows_score
```

### 3.5 Output Schema

```json
{
  "run_id": "uuid",
  "engine_version": "text",
  "bias": "LONG",
  "flows_score": 1.5,
  "fii_5d_net": 842.5,
  "fii_5d_z": 1.3,
  "dii_5d_net": 310.2,
  "pcr_oi": 1.42,
  "pcr_oi_smooth": 1.38,
  "pcr_oi_percentile": 84,
  "sector_rs_spread": 0.018,
  "top_inflow_sectors": ["AUTO", "IT", "PHARMA"],
  "top_outflow_sectors": ["METAL", "REALTY", "INFRA"],
  "drivers": ["FII_STRONG_LONG", "PCR_CONTRARIAN_BULLISH", "SECTOR_ROTATION_LONG"]
}
```

---

## 4. LEADERSHIP ENGINE

### 4.1 Purpose
Identify symbols with both relative and absolute strength aligned to the current market regime. Determines candidates, not portfolio action.

### 4.2 Universe
- F&O 200 liquid universe
- Exclude: liquidity failures, earnings blackout, corporate action blackout, < 200 valid sessions

### 4.3 Definitions

**`earnings_blackout`:** True if result date within `earnings_blackout_days` trading days (default: 5) of run date.
**`corporate_action_blackout`:** True if ex-date within `corp_action_days` calendar days (default: 2) of run date.

### 4.4 Per-Symbol Features

| Feature | Formula | Cross-sectional Z-score? |
|:---|:---|:---:|
| `rs_slope_20d` | Slope of log(stock_close / nifty_close) over 20d | Yes — clipped to [-3, +3] |
| `volume_ratio` | volume / sma(volume, 20) | Yes — clipped to [-3, +3] |
| `breakout_proximity` | (close - max(close, 20d)) / max(close, 20d) | Yes — clipped to [-3, +3] |
| `pct_vs_50dma` | (close - sma50) / sma50 | No — filter only |
| `pct_vs_200dma` | (close - sma200) / sma200 | No — filter only |
| `avg_turnover_20d` | sma(close * volume, 20) | No — filter only |

**Z-scoring:** Cross-sectional each session. Clip to `[-3, +3]`.

### 4.5 Composite Score

```python
def compute_composite_score(rs_slope_norm, volume_ratio_norm, breakout_norm, cfg):
    return (
        cfg.w_rs_slope * rs_slope_norm +
        cfg.w_volume_ratio * volume_ratio_norm +
        cfg.w_breakout * breakout_norm
    )
```

### 4.6 Ranking

**FIXED: Quintile naming corrected to industry standard**

1. Rank valid symbols by `composite_score`
2. Assign quintiles 1..5 (1 = lowest, 5 = highest)
3. **Quintile 1 = Q1 (Top performers)** ← FIXED (was Q5)
4. **Quintile 5 = Q5 (Bottom performers)** ← FIXED (was Q1)

### 4.7 Absolute Filters

```python
def is_long_eligible(symbol, top_outflow_sectors, cfg):
    """
    Long candidates: Q1 (top performers), above moving averages,
    liquid, no blackouts, not in outflow sectors.
    """
    return all([
        symbol.quintile == 1,                    # Q1 = top performers
        symbol.close > symbol.sma50,
        symbol.sma50 > symbol.sma200,
        symbol.pct_vs_200dma > 0,
        symbol.volume_ratio >= cfg.min_volume_ratio,
        symbol.avg_turnover_20d >= cfg.min_turnover_inr,
        not symbol.earnings_blackout,
        not symbol.corporate_action_blackout,
        symbol.sector not in top_outflow_sectors,
    ])

def is_short_eligible(symbol, top_inflow_sectors, cfg):
    """
    Short candidates: Q5 (bottom performers), below moving averages,
    liquid, no blackouts, not in inflow sectors.
    """
    return all([
        symbol.quintile == 5,                    # Q5 = bottom performers
        symbol.close < symbol.sma50,
        symbol.sma50 < symbol.sma200,
        symbol.pct_vs_200dma < 0,
        symbol.volume_ratio >= cfg.min_volume_ratio,
        symbol.avg_turnover_20d >= cfg.min_turnover_inr,
        not symbol.earnings_blackout,
        not symbol.corporate_action_blackout,
        symbol.sector not in top_inflow_sectors,
    ])
```

### 4.8 Candidate Selection by Regime

| Regime | Eligible |
|:---|:---|
| `TREND_UP` / `TREND_UP_HIGH_VOL` | Long eligible only (Q1 candidates) |
| `TREND_DOWN` / `TREND_DOWN_HIGH_VOL` | Short eligible only (Q5 candidates) |
| `RANGE_BOUND` / `TRANSITION` | Watchlist only; no trades |

### 4.9 Empty-Result Handling

Return `status: "INSUFFICIENT_CANDIDATES"` if no symbols pass filters.

### 4.10 Output Schema

```json
{
  "run_id": "uuid",
  "engine_version": "text",
  "status": "OK",
  "leaders": [
    {
      "symbol": "RELIANCE",
      "direction": "LONG",
      "quintile": 1,
      "rs_slope_20d": 0.042,
      "pct_vs_50dma": 0.038,
      "pct_vs_200dma": 0.112,
      "volume_ratio": 1.4,
      "avg_turnover_20d": 840000000.0,
      "composite_score": 2.11,
      "sector": "ENERGY"
    }
  ],
  "laggards": [...],
  "leader_count_q1": 6,
  "laggard_count_q5": 7,
  "universe_coverage": 198
}
```

---

## 5. RISK & SIZING ENGINE

### 5.1 Purpose
Convert market risk posture and symbol volatility into permitted trade size. Has veto power over all recommendations.

### 5.2 Inputs

| Metric | Source | Required |
|:---|:---|:---|
| `entry_price` | Last EOD close | Yes |
| `account_equity` | Portfolio | Yes |
| `account_risk_pct` | Config | Yes |
| `instrument_atr_14` | Symbol Daily | Yes |
| `atr_multiplier` | Config | Yes |
| `lot_size` | Instrument Metadata | Yes |
| `day_start_equity` | Portfolio | Yes |
| `equity_peak` | Portfolio | Yes |
| `current_equity` | Portfolio | Yes |
| `consecutive_loss_days` | Portfolio | Yes |
| `regime_base_risk_multiplier` | Regime Engine | Yes |

### 5.3 Derived Metrics

```python
session_loss_pct = (day_start_equity - current_equity) / day_start_equity * 100
peak_to_date_drawdown_pct = (equity_peak - current_equity) / equity_peak * 100
stop_distance = instrument_atr_14 * atr_multiplier
```

### 5.4 Raw Position Size

```python
def compute_raw_position_size(account_equity, account_risk_pct, regime_multiplier, stop_distance, lot_size):
    risk_budget = account_equity * (account_risk_pct / 100) * regime_multiplier
    raw_qty = risk_budget / stop_distance
    return floor_to_lot_size(raw_qty, lot_size)
```

### 5.5 Circuit Breakers

```python
def compute_circuit_breaker(session_loss_pct, peak_to_date_drawdown_pct, consecutive_loss_days, cfg):
    if session_loss_pct >= cfg.halt_session_loss_pct or peak_to_date_drawdown_pct >= cfg.halt_drawdown_pct:
        return "HALTED"
    if (
        session_loss_pct >= cfg.reduce_session_loss_pct or
        peak_to_date_drawdown_pct >= cfg.reduce_drawdown_pct or
        consecutive_loss_days >= cfg.reduce_loss_streak
    ):
        return "REDUCED"
    return "ACTIVE"
```

### 5.6 Portfolio Limits

| Check | Limit | Action if Breached |
|:---|:---|:---|
| Open positions | `max_open_positions` | Reject new |
| Sector concentration | `max_sector_concentration_pct` | Reject new |

### 5.7 Final Size

```python
def compute_final_position_size(raw_size, circuit_breaker, tradable):
    if circuit_breaker == "HALTED" or not tradable:
        return 0
    if circuit_breaker == "REDUCED":
        return floor_to_lot_size(raw_size * 0.5, lot_size)
    return raw_size
```

### 5.8 Output Schema

```json
{
  "run_id": "uuid",
  "engine_version": "text",
  "entry_price": 2450.0,
  "instrument_atr_14": 52.4,
  "atr_multiplier": 1.5,
  "stop_distance": 78.6,
  "account_risk_pct": 0.75,
  "regime_base_risk_multiplier": 1.0,
  "session_loss_pct": 0.4,
  "peak_to_date_drawdown_pct": 2.1,
  "consecutive_loss_days": 1,
  "circuit_breaker": "ACTIVE",
  "tradable": true,
  "final_position_size": 250
}
```

---

## 6. DECISION AGGREGATOR

### 6.1 Purpose
Aggregate engine outputs into an action recommendation. Orchestration layer only. No re-scoring.

### 6.2 Inputs

| Field | Source |
|:---|:---|
| `regime` | Regime Engine |
| `regime_confidence` | Regime Engine |
| `flows.bias` | Flows Engine |
| `flows.flows_score` | Flows Engine |
| `leaders.leader_count_q1` | Leadership Engine (FIXED: was q5) |
| `leaders.laggard_count_q5` | Leadership Engine (FIXED: was q1) |
| `leaders.status` | Leadership Engine |
| `risk.circuit_breaker` | Risk Engine |
| `risk.tradable` | Risk Engine |
| `risk.final_position_size` | Risk Engine |
| `leaders.leaders` | Leadership Engine |

### 6.3 Directional Voting

```python
def compute_directional_vote(regime, flows_bias, leader_count, laggard_count, cfg):
    votes = {
        "regime": cfg.w_regime * (
            1 if regime in ["TREND_UP", "TREND_UP_HIGH_VOL"] else
            -1 if regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"] else 0
        ),
        "flows": cfg.w_flows * (
            1 if flows_bias == "LONG" else
            -1 if flows_bias == "SHORT" else 0
        ),
        "leadership": cfg.w_leadership * (
            1 if leader_count >= cfg.min_leaders_for_vote else
            -1 if laggard_count >= cfg.min_leaders_for_vote else 0
        ),
    }
    direction_vote = sum(votes.values())

    if direction_vote > 0:
        direction = "LONG"
    elif direction_vote < 0:
        direction = "SHORT"
    else:
        direction = "NEUTRAL"

    agreement_count = sum(1 for v in votes.values() if (direction == "LONG" and v > 0) or (direction == "SHORT" and v < 0))
    confidence = round(min(abs(direction_vote), 1.0), 2)

    return direction, confidence, agreement_count, votes
```

### 6.4 Conflict Detection

```python
def detect_conflicts(regime, flows_bias, leaders, laggards, circuit_breaker, top_outflow_sectors, top_inflow_sectors):
    conflicts = []

    if regime in ["TREND_UP", "TREND_UP_HIGH_VOL"] and flows_bias == "SHORT":
        conflicts.append("REGIME_FLOW_CONFLICT")
    if regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"] and flows_bias == "LONG":
        conflicts.append("REGIME_FLOW_CONFLICT")

    # FIXED: Use correct quintile names
    leader_sectors = {s["sector"] for s in leaders}  # Q1 leaders
    laggard_sectors = {s["sector"] for s in laggards}  # Q5 laggards

    if direction == "LONG" and leader_sectors & set(top_outflow_sectors):
        conflicts.append("LEADERSHIP_SECTOR_CONFLICT")
    if direction == "SHORT" and laggard_sectors & set(top_inflow_sectors):
        conflicts.append("LEADERSHIP_SECTOR_CONFLICT")

    if circuit_breaker != "ACTIVE":
        conflicts.append("RISK_OVERRIDE")

    return conflicts
```

### 6.5 Confidence Adjustments

```python
def adjust_confidence(base_confidence, conflicts):
    for c in conflicts:
        if c == "REGIME_FLOW_CONFLICT":
            base_confidence *= 0.80
        elif c == "LEADERSHIP_SECTOR_CONFLICT":
            base_confidence *= 0.85
        elif c == "RISK_OVERRIDE":
            base_confidence *= 0.70
    return round(base_confidence, 2)
```

### 6.6 Action Mapping

```python
def determine_action(direction, confidence, agreement_count, circuit_breaker, tradable, has_candidates):
    if circuit_breaker == "HALTED" or not tradable or not has_candidates:
        return "NO_TRADE"
    if confidence >= cfg.confidence_full and agreement_count >= 3:
        return direction
    if confidence >= cfg.confidence_small and agreement_count >= 2:
        return f"{direction}_SMALL"
    return "NO_TRADE"
```

### 6.7 Top Recommendations

```python
def get_top_recommendations(leaders, laggards, direction, cfg):
    eligible = leaders if direction in ["LONG", "LONG_SMALL"] else laggards
    return sorted(eligible, key=lambda s: s["composite_score"], reverse=True)[:cfg.max_recommendations]
```

### 6.8 Output Schema

```json
{
  "run_id": "uuid",
  "engine_version": "text",
  "direction": "LONG",
  "action": "LONG",
  "confidence": 0.72,
  "agreement_count": 3,
  "votes": {"regime": 0.45, "flows": 0.30, "leadership": 0.25},
  "conflicts": [],
  "top_recommendations": [
    {
      "symbol": "RELIANCE",
      "direction": "LONG",
      "position_size": 250,
      "composite_score": 2.11,
      "reason": "Q1 leader (top quintile), absolute uptrend, sector not in outflows"
    }
  ]
}
```

---

## 7. PERSISTENCE & REALTIME

### 7.1 Table Architecture

| Table | Purpose | Retention |
|:---|:---|:---|
| `run_registry` | One row per pipeline run | Indefinite |
| `signals_summary` | UI subscription target | Indefinite |
| `regime_history` | Flattened regime fields | Indefinite |
| `flows_history` | Flattened flows fields | Indefinite |
| `stock_scores` | Per-symbol audit detail | 90 days rolling |

### 7.2 Frontend Rules
- Subscribe to `signals_summary` only
- Render latest row by `run_ts DESC LIMIT 1`
- Stale data badge if no run by 17:30 IST
- "No Active Recommendations" if `leaders.status == "INSUFFICIENT_CANDIDATES"`
- Display "_HIGH_VOL" regimes with reduced risk badge

---

## 8. ERROR & EDGE CASES

### 8.1 Missing Input Data

| Engine | Missing Input | Behavior |
|:---|:---|:---|
| Regime | VIX | Use last known; percentile = null; confidence volatility = 0 |
| Regime | Breadth | Skip breadth check; confidence breadth = 0 |
| Flows | FII data | Set FII components to 0; log warning |
| Flows | PCR | Skip PCR scoring; omit driver |
| Leadership | < 100 valid symbols | Log `UNIVERSE_DEGRADED`; proceed |
| Risk | `account_equity` | Halt engine; set circuit_breaker = "HALTED" |

### 8.2 Non-Trading Day Runs
Detect by EOD data timestamp mismatch. Skip execution. Do not write to `signals_summary`.

---

## 9. BACKTEST FRAMEWORK

### 9.1 Purpose
Validate signal quality before any live or paper trading.

### 9.2 Required Data
- Nifty 50 daily OHLCV: minimum 2 years
- India VIX daily: minimum 2 years
- F&O 200 daily OHLCV: minimum 2 years
- FII flow data: minimum 2 years
- NSE sector indices: minimum 2 years
- PCR OI: minimum 1 year

### 9.3 Backtest Period
- Train/validation split: 70/30 minimum
- Walk-forward windows: quarterly rebalance
- Out-of-sample test: minimum 1 year

### 9.4 Strategy Representation

For each historical session:
1. Run Regime Engine → get regime
2. Run Flows Engine → get bias
3. Run Leadership Engine → get candidates
4. Apply risk filters → get tradable candidates
5. Decision Aggregator → get action

### 9.5 Position Entry Rules
- Entry: next session open after signal
- Long entry: top Q1 eligible with highest composite_score
- Short entry: top Q5 eligible with lowest composite_score
- Size: Risk Engine output
- **Slippage: 0.05% per side (0.10% round-trip)** ← FIXED: Added execution cost

### 9.6 Position Exit Rules

**FIXED: Symmetric exit rules**

| Exit Type | Trigger | Priority |
|:---|:---|:---:|
| Stop Loss | entry - (ATR × atr_multiplier) | 1 — mandatory |
| Target | entry + (ATR × atr_multiplier × 2.0) | 2 |
| Time-based | 10 trading days elapsed | 3 — soft exit, not mandatory |
| Regime change | Regime flips to opposing direction | 4 — soft exit |

**Logic:**
- Stop loss exit is ALWAYS executed if hit (hard stop)
- Target exit is executed if hit (can exit same day as stop if both hit, use stop)
- Time-based: if neither stop nor target hit by day 10, exit at close
- Regime change: if regime flips to opposing direction (e.g., TREND_UP → TREND_DOWN), exit at next open

```python
def check_exit_conditions(position, current_price, atr_14, atr_mult, entry_date, run_date, current_regime, prev_regime, cfg):
    """
    Returns: (should_exit, exit_reason, exit_price)
    """
    days_elapsed = (run_date - entry_date).days
    stop_distance = atr_14 * atr_mult
    target_distance = atr_14 * atr_mult * 2.0

    # Stop loss: mandatory
    if position.direction == "LONG" and current_price <= position.entry_price - stop_distance:
        return True, "STOP_HIT", position.entry_price - stop_distance
    if position.direction == "SHORT" and current_price >= position.entry_price + stop_distance:
        return True, "STOP_HIT", position.entry_price + stop_distance

    # Target: optional (don't exit if stop also hit same bar)
    if position.direction == "LONG" and current_price >= position.entry_price + target_distance:
        return True, "TARGET_HIT", current_price  # Use current price, not theoretical target
    if position.direction == "SHORT" and current_price <= position.entry_price - target_distance:
        return True, "TARGET_HIT", current_price

    # Regime change: soft exit
    opposing_regimes = {
        "LONG": ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"],
        "SHORT": ["TREND_UP", "TREND_UP_HIGH_VOL"]
    }
    if current_regime in opposing_regimes.get(position.direction, []):
        return True, "REGIME_CHANGE", current_price

    # Time-based: soft exit at day 10
    if days_elapsed >= 10:
        return True, "TIME_EXIT", current_price

    return False, None, None
```

### 9.7 Performance Metrics

| Metric | Threshold for Success |
|:---|:---|
| Total Return | > Buy & Hold with lower drawdown |
| Sharpe Ratio | > 0.8 |
| Max Drawdown | < 15% |
| Win Rate | > 45% |
| Profit Factor | > 1.2 |
| Trade Count | > 50 (minimum sample) |
| **Avg Slippage Cost** | Report per trade, included in returns |

### 9.8 Regime-Level Performance

Report metrics segmented by regime:
- `TREND_UP` trades only
- `TREND_DOWN` trades only
- `TREND_UP_HIGH_VOL` trades only
- `TREND_DOWN_HIGH_VOL` trades only
- `RANGE_BOUND` trades only

If any regime segment shows negative expectancy after 20+ trades, remove that regime from trading eligibility.

### 9.9 Confidence-Level Performance

Report metrics by confidence bucket:
- High (≥0.65)
- Medium (0.50–0.64)
- Low (<0.50)

If low-confidence trades show negative expectancy, tighten confidence thresholds.

### 9.10 Gate Criteria

Proceed to paper trading only if:
- Sharpe ≥ 0.8 out-of-sample
- Max drawdown < 15% out-of-sample
- No regime segment with negative expectancy after 20+ trades
- Trade count ≥ 50 over validation period

---

## 10. CONFIG REFERENCE

### 10.1 Regime

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `ts_d20_scale` | 0.05 | 0.01–0.15 | Soft cap scale for d20 |
| `ts_d50_scale` | 0.10 | 0.03–0.20 | Soft cap scale for d50 |
| `ts_d200_scale` | 0.20 | 0.05–0.40 | Soft cap scale for d200 |
| `ts_slope20_scale` | 0.005 | 0.001–0.02 | Soft cap scale for EMA20 slope |
| `ts_slope50_scale` | 0.002 | 0.001–0.01 | Soft cap scale for EMA50 slope |
| `min_adx_trend` | 25 | 15–35 | ADX threshold for trending (> not >=) |
| `max_adx_range` | 25 | 15–35 | ADX upper bound for range-bound (<=) |
| `min_trend_score` | 3 | 1–5 | trend_score threshold for trending |
| `max_ts_range` | 3 | 1–5 | trend_score bound for range-bound |
| `min_bullish_breadth` | 55 | 50–70 | % above 50DMA for bullish |
| `max_bearish_breadth` | 45 | 30–50 | % above 50DMA for bearish |
| `range_breadth_low` | 40 | 30–50 | Lower band for range-bound |
| `range_breadth_high` | 60 | 50–70 | Upper band for range-bound |
| `high_vol_vix_abs` | 20 | 15–30 | Absolute VIX for HIGH_VOL |
| `high_vol_vix_pct` | 75 | 60–90 | Percentile for HIGH_VOL |
| `min_confirm_days` | 2 | 1–5 | Sessions to confirm regime change |

### 10.2 Flows

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `fii_z_strong` | 1.0 | 0.5–2.0 | Z-score magnitude for FII scoring |
| `fii_z_lookback` | **252** | 126–504 | Sessions for FII Z-score lookback (FIXED: was 126) |
| `pcr_high_pct` | 80 | 70–90 | PCR percentile for contrarian bullish |
| `pcr_low_pct` | 20 | 10–30 | PCR percentile for contrarian bearish |
| `bias_threshold` | 1.25 | 0.75–2.0 | flows_score for directional bias |
| `min_sector_rs_spread` | 0.010 | 0.005–0.030 | Min RS slope spread for sector scoring |

### 10.3 Leadership

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `w_rs_slope` | 0.55 | 0.3–0.7 | Weight for rs_slope |
| `w_volume_ratio` | 0.25 | 0.1–0.4 | Weight for volume_ratio |
| `w_breakout` | 0.20 | 0.1–0.3 | Weight for breakout |
| `min_volume_ratio` | 1.2 | 1.0–2.0 | Minimum volume ratio |
| `min_turnover_inr` | 50,000,000 | — | Min avg daily turnover |
| `earnings_blackout_days` | 5 | 2–10 | Trading days around result |
| `z_score_clip` | **3** | 2–4 | Clip Z-scores to ±N (FIXED: explicit config) |

### 10.4 Risk

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `account_risk_pct` | 0.75 | 0.25–2.0 | % of account risked per trade |
| `atr_multiplier` | 1.5 | 1.0–3.0 | ATR multiple for stop distance |
| `max_stop_pct` | 0.04 | 0.02–0.08 | Max stop width as % of entry |
| `halt_session_loss_pct` | 1.5 | 0.5–3.0 | Session loss % to HALTED |
| `halt_drawdown_pct` | 6.0 | 3.0–15.0 | Peak drawdown % to HALTED |
| `reduce_session_loss_pct` | 1.0 | 0.5–2.0 | Session loss % to REDUCED |
| `reduce_drawdown_pct` | 4.0 | 2.0–10.0 | Peak drawdown % to REDUCED |
| `reduce_loss_streak` | 3 | 2–7 | Loss days to REDUCED |
| `max_open_positions` | 6 | 1–20 | Position cap |
| `max_sector_concentration_pct` | 40 | 20–80 | Max % in one sector |
| `corp_action_days` | 2 | 1–5 | Days before ex-date to blackout |

### 10.5 Decision Aggregator

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `w_regime` | 0.45 | — | Weight for regime vote |
| `w_flows` | 0.30 | — | Weight for flows vote |
| `w_leadership` | 0.25 | — | Weight for leadership vote |
| `min_leaders_for_vote` | 3 | 1–10 | Min Q1/Q5 for vote |
| `confidence_full` | 0.65 | 0.5–0.9 | Threshold for full action |
| `confidence_small` | 0.50 | 0.3–0.7 | Threshold for small action |
| `max_recommendations` | 5 | 1–20 | Max in top list |

**Constraint:** `w_regime + w_flows + w_leadership == 1.0`. Validate at config load.

### 10.6 Backtest (FIXED: Added)

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `slippage_bps` | 5 | 1–20 | Basis points per side (5 = 0.05%) |
| `target_mult` | 2.0 | 1.5–3.0 | ATR multiplier for target distance |
| `max_holding_days` | 10 | 5–20 | Days before time-based exit |

---

## 11. VALIDATION CHECKLIST

Before proceeding to Stage 2 (Paper Trading):

- [ ] Backtest run completes without errors
- [ ] All 6 regime states observed in backtest
- [ ] `TREND_UP` segment: positive expectancy after 20+ trades
- [ ] `TREND_DOWN` segment: positive expectancy after 20+ trades
- [ ] `TREND_UP_HIGH_VOL` segment: positive expectancy after 20+ trades
- [ ] `TREND_DOWN_HIGH_VOL` segment: positive expectancy after 20+ trades
- [ ] `RANGE_BOUND` segment: neutral or negative (expected)
- [ ] Sharpe ≥ 0.8 out-of-sample
- [ ] Max drawdown < 15% out-of-sample
- [ ] Trade count ≥ 50 over validation period
- [ ] No regime with negative expectancy after 20+ trades
- [ ] Code matches this specification (implementation audit)
- [ ] Slippage cost < 0.10% avg per trade (backtest validation)
- [ ] Z-score clipping working correctly (check for outliers)
