# 📘 Signal Engine & Dashboard — Technical Specification

**Version:** v0.2  
**Phase:** Stage 1 — Data Reliability Layer  
**Stack:** GitHub Actions (Compute) → Supabase (Storage/Realtime) → Vercel (UI)  
**Trading Horizon:** Positional (Daily/Weekly trends, EOD-driven)

---

## Changelog

| Version | Date | Changes |
|:---|:---|:---|
| v0.1 | 2026-04-25 | Initial draft |
| v0.2 | 2026-04-25 | Bug fixes: sector-confirmation always-true, risk directional vote asymmetry, regime_confidence HIGH_VOL penalty, RANGE_BOUND band collapse. Undefined references resolved. Magic numbers moved to config. Persistence auditability fixes. Section 0, 7, 8 added. |

---

## 0. DATA DICTIONARY & CONTRACTS

### Timezone Policy
- All **market-logic thresholds** (session boundaries, staleness) use **IST (UTC+5:30)**.
- All **stored timestamps** (`run_ts`, `created_at`) use **UTC**.
- Market session: 09:15–15:30 IST. EOD data availability: ~16:30 IST.

### run_id Contract
Every engine output carries the `run_id` from `run_registry` that produced it. No output is valid without a `run_id`. Engines are called sequentially within a single run.

### Engine Execution Order
```
Regime → Flows → Leadership → Risk → Decision Aggregator
```
Each engine receives only previously-computed engine outputs as upstream inputs, never raw features from a downstream engine.

### Shared Field Types
| Field | Type | Notes |
|:---|:---|:---|
| `run_id` | `uuid` | FK to `run_registry.run_id` |
| `engine_version` | `text` | Git SHA or semver of engine code |
| `run_ts` | `timestamptz` | UTC timestamp of pipeline execution |
| `regime` | `text` | One of the 6 regime states |
| `symbol` | `text` | NSE trading symbol |
| `sector` | `text` | NSE sector classification |

---

## 1. REGIME ENGINE

**Purpose:** Classify broad market structure and volatility state. Defines directional permissibility and baseline risk posture. Does **not** select stocks.

### 1.1 Inputs

| Metric | Source | Calculation |
|:---|:---|:---|
| `close` | Nifty 50 Daily | EOD close |
| `ema20` | Nifty 50 Daily | EMA(close, 20) |
| `ema50` | Nifty 50 Daily | EMA(close, 50) |
| `ema200` | Nifty 50 Daily | EMA(close, 200) |
| `ema20_prev` | Nifty 50 Daily | EMA20 from prior session |
| `ema50_prev` | Nifty 50 Daily | EMA50 from prior session |
| `adx_14` | Nifty 50 Daily | Wilder ADX(14) |
| `vix_value` | India VIX | Current close |
| `vix_percentile` | India VIX | 252-day rolling percentile of VIX close |
| `breadth_pct` | F&O 200 Universe | % of symbols whose close > SMA(close, 50) |
| `prev_regime` | State Store | Last confirmed regime |
| `prev_candidate_regime` | State Store | Last unconfirmed candidate regime |
| `prev_candidate_days` | State Store | Consecutive sessions current candidate has persisted |

### 1.2 trend_score Formula

`trend_score` is a composite in `[-10, +10]` built from three sub-components.

```python
def soft_cap(x: float, scale: float) -> float:
    """Normalise x to [-1, +1] using linear soft cap at ±scale."""
    return max(-1.0, min(1.0, x / scale))


def compute_trend_score(
    close, ema20, ema50, ema200, ema20_prev, ema50_prev
) -> float:
    """
    Returns trend_score in [-10, +10].
    Config keys (see Section 8):
      regime.ts_d20_scale, regime.ts_d50_scale, regime.ts_d200_scale
      regime.ts_slope20_scale, regime.ts_slope50_scale
    """
    # --- Component 1: Price distance from EMAs (40% weight) ---
    d20  = (close - ema20)  / ema20
    d50  = (close - ema50)  / ema50
    d200 = (close - ema200) / ema200

    distance_score = (
        0.40 * soft_cap(d20,  cfg.regime.ts_d20_scale)   +
        0.35 * soft_cap(d50,  cfg.regime.ts_d50_scale)   +
        0.25 * soft_cap(d200, cfg.regime.ts_d200_scale)
    )

    # --- Component 2: EMA alignment (35% weight) ---
    if ema20 > ema50 > ema200:
        alignment_score = 1.0    # full bullish stack
    elif ema20 < ema50 < ema200:
        alignment_score = -1.0   # full bearish stack
    elif ema20 > ema50 and ema50 < ema200:
        alignment_score = 0.33   # partially bullish
    elif ema20 < ema50 and ema50 > ema200:
        alignment_score = -0.33  # partially bearish
    else:
        alignment_score = 0.0    # mixed / flat

    # --- Component 3: EMA slopes (25% weight) ---
    slope20 = (ema20 - ema20_prev) / ema20_prev
    slope50 = (ema50 - ema50_prev) / ema50_prev

    slope_score = (
        0.60 * soft_cap(slope20, cfg.regime.ts_slope20_scale) +
        0.40 * soft_cap(slope50, cfg.regime.ts_slope50_scale)
    )

    # --- Composite ---
    raw = (
        0.40 * distance_score  +
        0.35 * alignment_score +
        0.25 * slope_score
    )
    return round(raw * 10, 2)
```

### 1.3 Regime States

```
TREND_UP | TREND_DOWN | TREND_UP_HIGH_VOL | TREND_DOWN_HIGH_VOL | RANGE_BOUND | TRANSITION
```

### 1.4 Base Classification

```python
def classify_regime(trend_score, adx_14, vix_value, vix_percentile, breadth_pct):
    high_vol = (
        vix_value       > cfg.regime.high_vol_vix_abs and
        vix_percentile  > cfg.regime.high_vol_vix_pct
    )

    # Uptrend
    if (adx_14 >= cfg.regime.min_adx_trend and
            trend_score >= cfg.regime.min_trend_score and
            breadth_pct >= cfg.regime.min_bullish_breadth):
        return "TREND_UP_HIGH_VOL" if high_vol else "TREND_UP"

    # Downtrend
    if (adx_14 >= cfg.regime.min_adx_trend and
            trend_score <= -cfg.regime.min_trend_score and
            breadth_pct <= cfg.regime.max_bearish_breadth):
        return "TREND_DOWN_HIGH_VOL" if high_vol else "TREND_DOWN"

    # Range-bound: widened bands vs v0.1 to reduce TRANSITION over-firing
    if (adx_14 < cfg.regime.max_adx_range and
            abs(trend_score) < cfg.regime.max_ts_range and
            cfg.regime.range_breadth_low < breadth_pct < cfg.regime.range_breadth_high):
        return "RANGE_BOUND"

    # Explicit fallback: conditions are ambiguous / in flux
    return "TRANSITION"
```

**Config defaults (see Section 8):**
- `min_adx_trend = 25`, `max_adx_range = 25`, `min_trend_score = 3`, `max_ts_range = 3`
- `min_bullish_breadth = 55`, `max_bearish_breadth = 45`
- `range_breadth_low = 40`, `range_breadth_high = 60`
- `high_vol_vix_abs = 20`, `high_vol_vix_pct = 75`

### 1.5 Confirmation / Hysteresis

```python
MIN_CONFIRM_DAYS = cfg.regime.min_confirm_days  # default 2

candidate_regime = classify_regime(
    trend_score, adx_14, vix_value, vix_percentile, breadth_pct
)

if candidate_regime == prev_regime:
    # No change; reset candidate state
    regime             = prev_regime
    candidate_regime_out = candidate_regime
    candidate_days_out   = 0

elif candidate_regime == prev_candidate_regime:
    # Same candidate persisting; increment counter
    candidate_days_out = prev_candidate_days + 1
    regime = (
        candidate_regime if candidate_days_out >= MIN_CONFIRM_DAYS
        else prev_regime
    )
    candidate_regime_out = candidate_regime

else:
    # New candidate; start count at 1
    regime               = prev_regime
    candidate_regime_out = candidate_regime
    candidate_days_out   = 1
```

### 1.6 Confidence

Confidence reflects how many signals *corroborate* the current regime classification.
The volatility component is regime-aware: for HIGH_VOL regimes, high VIX confirms; for normal regimes, low VIX confirms.

```python
def compute_regime_confidence(regime, trend_score, adx_14, breadth_pct, vix_percentile):
    is_high_vol_regime = "HIGH_VOL" in regime

    regime_components = {
        "trend": 1 if abs(trend_score) >= cfg.regime.min_trend_score else 0,
        "strength": 1 if adx_14 >= cfg.regime.min_adx_trend else 0,
        "breadth": 1 if (
            (trend_score >= cfg.regime.min_trend_score and
             breadth_pct >= cfg.regime.min_bullish_breadth) or
            (trend_score <= -cfg.regime.min_trend_score and
             breadth_pct <= cfg.regime.max_bearish_breadth)
        ) else 0,
        # Confirms when VIX state matches regime type
        "volatility": 1 if (
            (is_high_vol_regime and vix_percentile > cfg.regime.high_vol_vix_pct) or
            (not is_high_vol_regime and vix_percentile <= cfg.regime.high_vol_vix_pct)
        ) else 0,
    }
    return round(sum(regime_components.values()) / 4, 2)
```

### 1.7 Risk Posture Mapping

| Regime | Directional Bias Allowed | Base Risk Multiplier |
|:---|:---|:---:|
| `TREND_UP` | Long-only preferred | 1.00 |
| `TREND_DOWN` | Short-only preferred | 1.00 |
| `TREND_UP_HIGH_VOL` | Long-only selective | 0.60 |
| `TREND_DOWN_HIGH_VOL` | Short-only selective | 0.60 |
| `RANGE_BOUND` | Mean-reversion only or no-trade | 0.40 |
| `TRANSITION` | Reduce participation | 0.50 |

### 1.8 Output Schema

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "engine_version": "abc1234",
  "regime": "TREND_UP",
  "candidate_regime": "TREND_UP",
  "candidate_days": 0,
  "trend_score": 4.2,
  "adx_14": 28.5,
  "vix_value": 14.8,
  "vix_percentile": 32.1,
  "breadth_pct": 63.4,
  "regime_confidence": 1.0,
  "base_risk_multiplier": 1.0
}
```

---

## 2. FLOWS ENGINE

**Purpose:** Evaluate whether institutional participation, options sentiment, and sector rotation confirm or oppose the regime. May strengthen, weaken, or neutralize directional conviction. Does **not** define trade size.

### 2.1 Inputs

| Metric | Source | Calculation |
|:---|:---|:---|
| `fii_5d_net` | NSE Cash | Sum of last 5 sessions (₹ Cr) |
| `fii_5d_z` | Derived | Z-score of `fii_5d_net` vs trailing 126 sessions |
| `dii_5d_net` | NSE Cash | Sum of last 5 sessions; stored, non-scoring in v0.2 |
| `pcr_oi` | NSE Option Chain | Put OI / Call OI, smoothed by EMA(3) |
| `pcr_oi_percentile` | Derived | 252-day percentile of smoothed PCR |
| `sector_rs_slopes` | Sector indices | 20-day RS slope vs Nifty for each sector |
| `top_inflow_sectors` | Derived | Top 3 sectors by RS slope |
| `top_outflow_sectors` | Derived | Bottom 3 sectors by RS slope |
| `sector_rs_spread` | Derived | `max(sector_rs_slopes) - min(sector_rs_slopes)` |
| `delivery_score` | NSE Delivery | `(today_delivery_pct / median_20d_delivery) - 1`; valid only if `delivery_pct > 40%`; stored, non-scoring in v0.2 |
| `regime` | Regime Engine | Confirmed regime |

### 2.2 Scoring Logic

```python
flows_score = 0.0
drivers = []

# --- Institutional participation ---
if fii_5d_z >= cfg.flows.fii_z_strong:
    flows_score += 1.0
    drivers.append("FII_STRONG_LONG")
elif fii_5d_z <= -cfg.flows.fii_z_strong:
    flows_score -= 1.0
    drivers.append("FII_STRONG_SHORT")

# --- Contrarian options sentiment ---
if pcr_oi_percentile >= cfg.flows.pcr_high_pct:
    flows_score += 0.75
    drivers.append("PCR_CONTRARIAN_BULLISH")
elif pcr_oi_percentile <= cfg.flows.pcr_low_pct:
    flows_score -= 0.75
    drivers.append("PCR_CONTRARIAN_BEARISH")

# --- Sector rotation confirmation ---
# Only fires when sector rotation is meaningful (spread > threshold)
# and the rotation direction aligns with the regime.
regime_aligned_long  = regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
regime_aligned_short = regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]
rotation_meaningful  = sector_rs_spread > cfg.flows.min_sector_rs_spread

if rotation_meaningful:
    if regime_aligned_long:
        flows_score += 0.50
        drivers.append("SECTOR_ROTATION_LONG")
    elif regime_aligned_short:
        flows_score -= 0.50
        drivers.append("SECTOR_ROTATION_SHORT")
```

### 2.3 Bias Mapping

```python
if flows_score >= cfg.flows.bias_threshold:
    bias = "LONG"
elif flows_score <= -cfg.flows.bias_threshold:
    bias = "SHORT"
else:
    bias = "NEUTRAL"
```

### 2.4 Guardrails

- `dii_5d_net`: stored, non-scoring. Activation gated on Stage 2 edge study proving additive value.
- `delivery_score`: stored, non-scoring. Activation gated on Stage 2 edge study.
- `max_pain`: excluded. Stored as expiry-context metadata only.
- If `regime` is `RANGE_BOUND` or `TRANSITION`, flows output is informational only; cannot force strong directional action by itself.

### 2.5 Output Schema

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "engine_version": "abc1234",
  "bias": "LONG",
  "flows_score": 1.5,
  "fii_5d_net": 842.5,
  "fii_5d_z": 1.3,
  "dii_5d_net": 310.2,
  "pcr_oi": 1.42,
  "pcr_oi_percentile": 84,
  "sector_rs_spread": 0.018,
  "top_inflow_sectors": ["AUTO", "IT", "PHARMA"],
  "top_outflow_sectors": ["METAL", "REALTY", "INFRA"],
  "delivery_score": 0.18,
  "drivers": ["FII_STRONG_LONG", "PCR_CONTRARIAN_BULLISH", "SECTOR_ROTATION_LONG"]
}
```

---

## 3. LEADERSHIP ENGINE

**Purpose:** Identify symbols with both relative and absolute strength aligned to the current market regime. Determines candidates, not portfolio action.

### 3.1 Universe

- F&O 200 liquid universe.
- Exclude symbols failing: liquidity filter, earnings blackout, corporate action blackout, data-completeness (< 200 valid sessions).

### 3.2 Definitions

**`earnings_blackout`:** `True` if the symbol has an NSE-announced earnings result date within `cfg.leadership.earnings_blackout_days` (default: 5) trading days forward or backward of the run date.

**`corporate_action_blackout`:** `True` if the symbol has an ex-date (dividend, split, bonus) within `cfg.risk.corp_action_days` (default: 2) calendar days of the run date.

### 3.3 Per-Symbol Features

| Feature | Formula | Type | Z-scored? |
|:---|:---|:---|:---|
| `rs_slope_20d` | `slope(log(stock_close / nifty_close), 20d)` | Cross-sectional | ✅ Yes |
| `volume_ratio` | `volume / sma(volume, 20)` | Cross-sectional | ✅ Yes |
| `breakout_proximity` | `(close - max(close, 20d)) / max(close, 20d)` | Cross-sectional | ✅ Yes |
| `pct_vs_50dma` | `(close - sma50) / sma50` | Absolute structural | ❌ No — used as filter only |
| `pct_vs_200dma` | `(close - sma200) / sma200` | Absolute structural | ❌ No — used as filter only |
| `avg_turnover_20d` | `sma(close * volume, 20)` | Liquidity | ❌ No — used as filter only |

**Z-scoring:** Apply cross-sectionally each session across the valid universe. Clip each z-score to `[-3, +3]`. Do **not** z-score absolute structural features (`pct_vs_50dma`, `pct_vs_200dma`, `avg_turnover_20d`).

### 3.4 Composite Score

Built from the three cross-sectional z-scored features only:

```python
composite_score = (
    cfg.leadership.w_rs_slope     * rs_slope_norm      +  # default 0.55
    cfg.leadership.w_volume_ratio * volume_ratio_norm   +  # default 0.25
    cfg.leadership.w_breakout     * breakout_norm          # default 0.20
)
```

> **Note:** `pct_vs_50dma` and `pct_vs_200dma` are absolute structural filters applied *after* quintile ranking, not components of the composite.

### 3.5 Relative Ranking

1. Rank all valid symbols by `composite_score`.
2. Assign quintiles `1..5`.
3. Only quintile `5` considered for long candidates.
4. Only quintile `1` considered for short candidates.

### 3.6 Absolute Filters

```python
def is_long_eligible(symbol_data, top_outflow_sectors):
    return (
        symbol_data.quintile == 5 and
        symbol_data.close > symbol_data.sma50 and
        symbol_data.sma50 > symbol_data.sma200 and
        symbol_data.pct_vs_200dma > 0 and
        symbol_data.volume_ratio >= cfg.leadership.min_volume_ratio and
        symbol_data.avg_turnover_20d >= cfg.leadership.min_turnover_inr and
        not symbol_data.earnings_blackout and
        not symbol_data.corporate_action_blackout and
        symbol_data.sector not in top_outflow_sectors
    )

def is_short_eligible(symbol_data, top_inflow_sectors):
    return (
        symbol_data.quintile == 1 and
        symbol_data.close < symbol_data.sma50 and
        symbol_data.sma50 < symbol_data.sma200 and
        symbol_data.pct_vs_200dma < 0 and
        symbol_data.volume_ratio >= cfg.leadership.min_volume_ratio and
        symbol_data.avg_turnover_20d >= cfg.leadership.min_turnover_inr and
        not symbol_data.earnings_blackout and
        not symbol_data.corporate_action_blackout and
        symbol_data.sector not in top_inflow_sectors
    )
```

### 3.7 Candidate Selection by Regime

| Regime | Eligible Candidates |
|:---|:---|
| `TREND_UP` / `TREND_UP_HIGH_VOL` | `long_eligible` only |
| `TREND_DOWN` / `TREND_DOWN_HIGH_VOL` | `short_eligible` only |
| `RANGE_BOUND` / `TRANSITION` | Suppress; return watchlist-only flag |

### 3.8 Empty-Result Handling

If no symbols pass filters, return:

```json
{
  "status": "INSUFFICIENT_CANDIDATES",
  "leaders": [],
  "laggards": [],
  "leader_count_q5": 0,
  "laggard_count_q1": 0
}
```
This status propagates to the Decision Aggregator, which must treat it as zero qualified candidates.

### 3.9 Output Schema

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "engine_version": "abc1234",
  "status": "OK",
  "leaders": [
    {
      "symbol": "RELIANCE",
      "direction": "LONG",
      "quintile": 5,
      "rs_slope_20d": 0.042,
      "pct_vs_50dma": 0.038,
      "pct_vs_200dma": 0.112,
      "volume_ratio": 1.4,
      "avg_turnover_20d": 840000000.0,
      "composite_score": 2.11,
      "sector": "ENERGY"
    }
  ],
  "laggards": [
    {
      "symbol": "TATASTEEL",
      "direction": "SHORT",
      "quintile": 1,
      "rs_slope_20d": -0.031,
      "pct_vs_50dma": -0.052,
      "pct_vs_200dma": -0.091,
      "volume_ratio": 1.3,
      "avg_turnover_20d": 620000000.0,
      "composite_score": -1.88,
      "sector": "METALS"
    }
  ],
  "leader_count_q5": 6,
  "laggard_count_q1": 7,
  "universe_coverage": 198,
  "timestamp": "2026-04-25T10:00:00Z"
}
```

---

## 4. RISK & SIZING ENGINE

**Purpose:** Convert market risk posture and symbol volatility into permitted trade size. Has veto power over all recommendations.

### 4.1 Inputs

| Metric | Source | Notes |
|:---|:---|:---|
| `entry_price` | Last EOD close of the candidate symbol | Used for stop-distance validation |
| `account_value` | Broker / Portfolio | Current equity |
| `account_risk_pct` | `cfg.risk.account_risk_pct` | Base risk per trade |
| `instrument_atr_14` | Symbol Daily | ATR(14) of the traded symbol |
| `atr_multiplier` | `cfg.risk.atr_multiplier` | Stop multiple |
| `lot_size` | Instrument Metadata | Exchange lot size |
| `day_start_equity` | Portfolio | Equity at market open (session start) |
| `equity_peak` | Portfolio | Rolling all-time peak equity |
| `current_equity` | Portfolio | Live or EOD equity |
| `consecutive_loss_days` | Portfolio | Count of consecutive negative EOD sessions |
| `regime_base_risk_multiplier` | Regime Engine | Risk posture multiplier |

### 4.2 Helper

```python
def floor_to_lot_size(qty: float, lot_size: int) -> int:
    """Round qty down to nearest whole lot."""
    return int(qty // lot_size) * lot_size
```

### 4.3 Derived Metrics

```python
session_loss_pct       = (day_start_equity - current_equity) / day_start_equity * 100
peak_to_date_drawdown_pct = (equity_peak - current_equity) / equity_peak * 100
stop_distance          = instrument_atr_14 * atr_multiplier
```

### 4.4 Raw Position Size

```python
risk_budget    = account_value * (account_risk_pct / 100) * regime_base_risk_multiplier
raw_qty        = risk_budget / stop_distance
position_size  = floor_to_lot_size(raw_qty, lot_size)
```

### 4.5 Tradeability Filters

```python
tradable = True

if position_size < lot_size:
    tradable = False   # minimum lot not achievable

if stop_distance / entry_price > cfg.risk.max_stop_pct:
    tradable = False   # stop too wide relative to price

if avg_turnover_20d < cfg.leadership.min_turnover_inr:
    tradable = False   # liquidity check (redundant with Leadership filter; kept as safety)

if corporate_action_blackout:
    tradable = False   # ex-date within blackout window
```

### 4.6 Circuit Breakers

```python
if (session_loss_pct >= cfg.risk.halt_session_loss_pct or
        peak_to_date_drawdown_pct >= cfg.risk.halt_drawdown_pct):
    circuit_breaker = "HALTED"

elif (session_loss_pct >= cfg.risk.reduce_session_loss_pct or
        peak_to_date_drawdown_pct >= cfg.risk.reduce_drawdown_pct or
        consecutive_loss_days >= cfg.risk.reduce_loss_streak):
    circuit_breaker = "REDUCED"

else:
    circuit_breaker = "ACTIVE"
```

### 4.7 Portfolio-Level Limits

Checked before `final_position_size` is returned. If either limit is breached, treat as `tradable = False`.

```python
if open_position_count >= cfg.risk.max_open_positions:
    tradable = False

if sector_exposure_pct(symbol.sector) >= cfg.risk.max_sector_concentration_pct:
    tradable = False
```

### 4.8 Final Size

```python
if circuit_breaker == "HALTED" or not tradable:
    final_position_size = 0
elif circuit_breaker == "REDUCED":
    final_position_size = floor_to_lot_size(position_size * 0.5, lot_size)
else:
    final_position_size = position_size
```

### 4.9 Output Schema

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "engine_version": "abc1234",
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

## 5. DECISION AGGREGATOR

**Purpose:** Aggregate engine outputs into an action recommendation. Orchestration layer only. Does **not** re-score raw features already consumed upstream.

> **Naming note:** This component was called "AI Advisor Shell" in v0.1. Renamed to reflect its actual mechanism: deterministic weighted voting across engine outputs. No ML is involved in v0.2.

### 5.1 Inputs

| Field | Source |
|:---|:---|
| `regime` | Regime Engine |
| `regime_confidence` | Regime Engine |
| `flows.bias` | Flows Engine |
| `flows.flows_score` | Flows Engine |
| `leaders.leader_count_q5` | Leadership Engine |
| `leaders.laggard_count_q1` | Leadership Engine |
| `leaders.status` | Leadership Engine |
| `risk.circuit_breaker` | Risk Engine |
| `risk.tradable` | Risk Engine |
| `risk.final_position_size` | Risk Engine |
| `leaders.leaders` | Leadership Engine | Full list; used to build `top_recommendations` |

### 5.2 Derived Variables

```python
# Sector overlap helpers
leader_sectors  = {s["sector"] for s in leaders.leaders}
laggard_sectors = {s["sector"] for s in leaders.laggards}

leader_sector_overlap_outflows  = bool(leader_sectors  & set(flows.top_outflow_sectors))
laggard_sector_overlap_inflows  = bool(laggard_sectors & set(flows.top_inflow_sectors))

# Candidate availability
no_candidates = leaders.status == "INSUFFICIENT_CANDIDATES"
```

### 5.3 Directional Voting

Risk is **not** a directional voter; it is a gate (see 5.6). Weights sum to 1.0 across 3 directional voters.

```python
votes = {
    "regime": cfg.advisor.w_regime * (
        1  if regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
        else -1 if regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]
        else 0
    ),
    "flows": cfg.advisor.w_flows * (
        1  if flows_bias == "LONG"
        else -1 if flows_bias == "SHORT"
        else 0
    ),
    "leadership": cfg.advisor.w_leadership * (
        1  if leader_count_q5 >= cfg.advisor.min_leaders_for_vote
        else -1 if laggard_count_q1 >= cfg.advisor.min_leaders_for_vote
        else 0
    ),
}
# Defaults: w_regime=0.45, w_flows=0.30, w_leadership=0.25
# direction_vote range: [-1.0, +1.0]

direction_vote = sum(votes.values())

if direction_vote > 0:
    direction       = "LONG"
    agreement_count = sum(1 for v in votes.values() if v > 0)
elif direction_vote < 0:
    direction       = "SHORT"
    agreement_count = sum(1 for v in votes.values() if v < 0)
else:
    direction       = "NEUTRAL"
    agreement_count = 0

confidence = round(min(abs(direction_vote), 1.0), 2)
```

### 5.4 Conflict Detection

```python
conflicts = []

if regime in ["TREND_UP", "TREND_UP_HIGH_VOL"] and flows_bias == "SHORT":
    conflicts.append("REGIME_FLOW_CONFLICT")

if regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"] and flows_bias == "LONG":
    conflicts.append("REGIME_FLOW_CONFLICT")

if direction == "LONG" and leader_sector_overlap_outflows:
    conflicts.append("LEADERSHIP_SECTOR_CONFLICT")

if direction == "SHORT" and laggard_sector_overlap_inflows:
    conflicts.append("LEADERSHIP_SECTOR_CONFLICT")

if circuit_breaker != "ACTIVE":
    conflicts.append("RISK_OVERRIDE")
```

### 5.5 Confidence Adjustments

```python
for c in conflicts:
    if c == "REGIME_FLOW_CONFLICT":
        confidence *= 0.80
    elif c == "LEADERSHIP_SECTOR_CONFLICT":
        confidence *= 0.85
    elif c == "RISK_OVERRIDE":
        confidence *= 0.70

confidence = round(confidence, 2)
```

### 5.6 Action Mapping

Risk is the gate here: circuit breaker and tradability block the action regardless of directional confidence.

```python
if circuit_breaker == "HALTED" or not tradable or no_candidates:
    action = "NO_TRADE"
elif confidence >= cfg.advisor.confidence_full and agreement_count >= 3:
    action = direction         # all 3 voters agree
elif confidence >= cfg.advisor.confidence_small and agreement_count >= 2:
    action = f"{direction}_SMALL"
else:
    action = "NO_TRADE"
# Defaults: confidence_full=0.65, confidence_small=0.50
```

### 5.7 Top Recommendations

```python
eligible = leaders.leaders if direction in ["LONG", "LONG_SMALL"] else leaders.laggards
top_recommendations = sorted(
    eligible, key=lambda s: s["composite_score"], reverse=(direction in ["LONG", "LONG_SMALL"])
)[:cfg.advisor.max_recommendations]  # default 5
```

### 5.8 Reasoning

```python
reasoning = [
    f"Regime={regime} (conf={regime_confidence})",
    f"Flows bias={flows_bias} (score={flows_score})",
    f"Leadership: Q5={leader_count_q5}, Q1={laggard_count_q1}",
    f"Risk: cb={circuit_breaker}, tradable={tradable}, size={final_position_size}",
]
if conflicts:
    reasoning.append(f"Conflicts={','.join(conflicts)}")
```

### 5.9 Output Schema

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "engine_version": "abc1234",
  "direction": "LONG",
  "action": "LONG",
  "confidence": 0.72,
  "agreement_count": 3,
  "votes": {
    "regime": 0.45,
    "flows": 0.30,
    "leadership": 0.25
  },
  "conflicts": [],
  "reasoning": [
    "Regime=TREND_UP (conf=1.0)",
    "Flows bias=LONG (score=1.5)",
    "Leadership: Q5=6, Q1=7",
    "Risk: cb=ACTIVE, tradable=true, size=250"
  ],
  "top_recommendations": [
    {
      "symbol": "RELIANCE",
      "direction": "LONG",
      "position_size": 250,
      "composite_score": 2.11,
      "reason": "Q5 leader, absolute uptrend, sector not in outflows"
    }
  ],
  "timestamp": "2026-04-25T10:00:00Z"
}
```

---

## 6. PERSISTENCE & REALTIME

**Purpose:** Publish one coherent engine snapshot per run; maintain audit trail for deterministic replay.

### 6.1 Table Architecture

| Table | Purpose | Retention |
|:---|:---|:---|
| `run_registry` | One row per pipeline run | Indefinite |
| `signals_summary` | One row per run; UI subscription target | Indefinite |
| `regime_history` | Flattened columnar regime fields per run | Indefinite |
| `flows_history` | Flattened columnar flows fields per run | Indefinite |
| `stock_scores` | Per-symbol detail for audit and debug | 90 days rolling |

### 6.2 `signals_summary` Schema

```sql
CREATE TABLE signals_summary (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid        NOT NULL REFERENCES run_registry(run_id),
  engine_version text        NOT NULL,
  run_ts         timestamptz NOT NULL,
  regime         jsonb       NOT NULL,
  flows          jsonb       NOT NULL,
  leaders        jsonb       NOT NULL,
  risk           jsonb       NOT NULL,
  advisor        jsonb       NOT NULL,
  created_at     timestamptz DEFAULT now()
);
```

### 6.3 `regime_history` Schema (flattened for audit queries)

```sql
CREATE TABLE regime_history (
  run_id               uuid        NOT NULL REFERENCES run_registry(run_id),
  engine_version       text        NOT NULL,
  run_ts               timestamptz NOT NULL,
  regime               text        NOT NULL,
  candidate_regime     text,
  candidate_days       int,
  trend_score          numeric,
  adx_14               numeric,
  vix_value            numeric,
  vix_percentile       numeric,
  breadth_pct          numeric,
  regime_confidence    numeric,
  base_risk_multiplier numeric,
  PRIMARY KEY (run_id)
);
```

### 6.4 `flows_history` Schema (flattened for audit queries)

```sql
CREATE TABLE flows_history (
  run_id               uuid        NOT NULL REFERENCES run_registry(run_id),
  engine_version       text        NOT NULL,
  run_ts               timestamptz NOT NULL,
  bias                 text,
  flows_score          numeric,
  fii_5d_net           numeric,
  fii_5d_z             numeric,
  dii_5d_net           numeric,
  pcr_oi               numeric,
  pcr_oi_percentile    numeric,
  sector_rs_spread     numeric,
  delivery_score       numeric,
  drivers              text[],
  PRIMARY KEY (run_id)
);
```

### 6.5 Frontend Rules

- Subscribe only to `signals_summary`.
- Render latest row only (by `run_ts DESC LIMIT 1`).
- **Staleness:** If no successful run exists for the current trading day by **17:30 IST**, display a "Stale Data" badge. Non-trading days are exempt.
- If `advisor.action == "NO_TRADE"`, do not visually imply a directional recommendation.
- If `regime` contains `_HIGH_VOL`, display reduced risk status badge; do **not** hide or disable directional display.
- Display "Watchlist Only" badge when regime is `RANGE_BOUND` or `TRANSITION`.
- If `leaders.status == "INSUFFICIENT_CANDIDATES"`, display "No Active Recommendations" rather than an empty list.
- `top_recommendations` list may be empty; render an explicit empty state, not a blank panel.

---

## 7. ERROR & EDGE CASES

### 7.1 Missing Input Data

| Engine | Missing Input | Behaviour |
|:---|:---|:---|
| Regime | VIX unavailable | Use last known `vix_value`; set `vix_percentile = null`; confidence volatility component = 0 |
| Regime | Breadth data unavailable | Skip breadth check; confidence breadth component = 0 |
| Flows | FII data delayed | Set `fii_5d_z = 0`; omit FII driver; log `DATA_MISSING: fii` |
| Flows | PCR unavailable | Skip PCR scoring; omit PCR driver |
| Leadership | < 100 valid symbols | Log `UNIVERSE_DEGRADED`; proceed with available; flag in output |
| Risk | `account_value` unavailable | Halt engine; set `circuit_breaker = "HALTED"` |

### 7.2 Non-Trading Day Runs

If the pipeline triggers on a non-trading day (e.g., market holiday):
- Detect by checking whether EOD data timestamp matches run date.
- Log `TRIGGER: non_trading_day`.
- Skip engine execution.
- Do not write a new row to `signals_summary`.

### 7.3 All Positions HALTED

If `circuit_breaker == "HALTED"` and `final_position_size == 0` for all candidates:
- `advisor.action = "NO_TRADE"`.
- Populate `reasoning` with the circuit breaker trigger (e.g., session_loss_pct, drawdown_pct).
- Still persist full engine snapshot for replay.

---

## 8. CONFIG REFERENCE

All constants referenced in logic sections appear here. These values are loaded at runtime from `config/signals.yaml` and serialized into `run_registry.config_snapshot`.

### 8.1 Regime

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `regime.min_adx_trend` | 25 | 15–35 | ADX threshold for trending classification |
| `regime.max_adx_range` | 25 | 15–35 | ADX upper bound for range-bound classification |
| `regime.min_trend_score` | 3 | 1–5 | trend_score threshold for trending classification |
| `regime.max_ts_range` | 3 | 1–5 | trend_score bound for range-bound classification |
| `regime.min_bullish_breadth` | 55 | 50–70 | % above 50DMA for bullish breadth |
| `regime.max_bearish_breadth` | 45 | 30–50 | % above 50DMA for bearish breadth |
| `regime.range_breadth_low` | 40 | 30–50 | Lower band for range-bound breadth |
| `regime.range_breadth_high` | 60 | 50–70 | Upper band for range-bound breadth |
| `regime.high_vol_vix_abs` | 20 | 15–30 | Absolute VIX level for HIGH_VOL flag |
| `regime.high_vol_vix_pct` | 75 | 60–90 | Percentile for HIGH_VOL flag |
| `regime.min_confirm_days` | 2 | 1–5 | Sessions before regime change confirms |
| `regime.ts_d20_scale` | 0.05 | 0.01–0.15 | Soft cap scale for d20 |
| `regime.ts_d50_scale` | 0.10 | 0.03–0.20 | Soft cap scale for d50 |
| `regime.ts_d200_scale` | 0.20 | 0.05–0.40 | Soft cap scale for d200 |
| `regime.ts_slope20_scale` | 0.005 | 0.001–0.02 | Soft cap scale for EMA20 slope |
| `regime.ts_slope50_scale` | 0.002 | 0.001–0.01 | Soft cap scale for EMA50 slope |

### 8.2 Flows

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `flows.fii_z_strong` | 1.0 | 0.5–2.0 | Z-score magnitude for FII to score |
| `flows.pcr_high_pct` | 80 | 70–90 | PCR percentile for contrarian bullish |
| `flows.pcr_low_pct` | 20 | 10–30 | PCR percentile for contrarian bearish |
| `flows.bias_threshold` | 1.25 | 0.75–2.0 | flows_score needed for directional bias |
| `flows.min_sector_rs_spread` | 0.010 | 0.005–0.030 | Min RS slope spread for sector scoring |

### 8.3 Leadership

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `leadership.w_rs_slope` | 0.55 | 0.3–0.7 | Composite weight for rs_slope |
| `leadership.w_volume_ratio` | 0.25 | 0.1–0.4 | Composite weight for volume_ratio |
| `leadership.w_breakout` | 0.20 | 0.1–0.3 | Composite weight for breakout_proximity |
| `leadership.min_volume_ratio` | 1.2 | 1.0–2.0 | Minimum volume ratio for eligibility |
| `leadership.min_turnover_inr` | 50000000 | — | Min avg daily turnover (₹) |
| `leadership.earnings_blackout_days` | 5 | 2–10 | Trading days around result date |

### 8.4 Risk

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `risk.account_risk_pct` | 0.75 | 0.25–2.0 | % of account risked per trade |
| `risk.atr_multiplier` | 1.5 | 1.0–3.0 | ATR multiple for stop distance |
| `risk.max_stop_pct` | 0.04 | 0.02–0.08 | Max stop width as % of entry_price |
| `risk.halt_session_loss_pct` | 1.5 | 0.5–3.0 | Session loss % to trigger HALTED |
| `risk.halt_drawdown_pct` | 6.0 | 3.0–15.0 | Peak drawdown % to trigger HALTED |
| `risk.reduce_session_loss_pct` | 1.0 | 0.5–2.0 | Session loss % to trigger REDUCED |
| `risk.reduce_drawdown_pct` | 4.0 | 2.0–10.0 | Peak drawdown % to trigger REDUCED |
| `risk.reduce_loss_streak` | 3 | 2–7 | Consecutive loss days to trigger REDUCED |
| `risk.max_open_positions` | 6 | 1–20 | Portfolio-level position cap |
| `risk.max_sector_concentration_pct` | 40 | 20–80 | Max % of portfolio in one sector |
| `risk.corp_action_days` | 2 | 1–5 | Calendar days before ex-date to blackout |

### 8.5 Decision Aggregator

| Key | Default | Valid Range | Description |
|:---|:---|:---|:---|
| `advisor.w_regime` | 0.45 | — | Weight for regime vote |
| `advisor.w_flows` | 0.30 | — | Weight for flows vote |
| `advisor.w_leadership` | 0.25 | — | Weight for leadership vote |
| `advisor.min_leaders_for_vote` | 3 | 1–10 | Min Q5/Q1 symbols for a directional vote |
| `advisor.confidence_full` | 0.65 | 0.5–0.9 | Confidence threshold for full action |
| `advisor.confidence_small` | 0.50 | 0.3–0.7 | Confidence threshold for small action |
| `advisor.max_recommendations` | 5 | 1–20 | Max symbols in top_recommendations |

> **Constraint:** `advisor.w_regime + advisor.w_flows + advisor.w_leadership` must equal 1.0. Validate at config load time.
