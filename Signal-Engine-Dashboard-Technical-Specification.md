# 📘 Signal Engine & Dashboard — Technical Specification (Revised)

**Phase:** Week 3–4 hardening  
**Stack:** GitHub Actions (Compute) → Supabase (Storage/Realtime) → Vercel (UI)  
**Trading Horizon:** Positional (Daily/Weekly trends, EOD-driven with optional low-frequency intraday confirmation)

---

## 1. REGIME ENGINE

**Purpose:** Classify broad market structure and volatility state. This engine defines directional permissibility and baseline risk posture. It does **not** select stocks.

### Inputs
| Metric | Source | Calculation |
|:---|:---|:---|
| `trend_score` | Nifty 50 Daily | Composite of price vs EMA20/50/200, EMA alignment, EMA20 slope, EMA50 slope; normalized to range `-10` to `+10`. |
| `adx_14` | Nifty 50 Daily | Wilder ADX(14). |
| `vix_value` | India VIX | Current close. |
| `vix_percentile` | India VIX | 252-day rolling percentile. |
| `breadth_pct` | F&O 200 Universe | `% of symbols above 50DMA`. |
| `prev_regime` | State Store | Last confirmed regime. |
| `prev_candidate_regime` | State Store | Last unconfirmed candidate regime. |
| `prev_candidate_days` | State Store | Consecutive runs candidate regime has persisted. |

### Regime States
- `TREND_UP`
- `TREND_DOWN`
- `TREND_UP_HIGH_VOL`
- `TREND_DOWN_HIGH_VOL`
- `RANGE_BOUND`
- `TRANSITION`

### Base Classification
```python
def classify_regime(trend_score, adx_14, vix_value, vix_percentile, breadth_pct):
    if adx_14 >= 25 and trend_score >= 3 and breadth_pct >= 55:
        return "TREND_UP_HIGH_VOL" if (vix_value > 20 and vix_percentile > 75) else "TREND_UP"

    if adx_14 >= 25 and trend_score <= -3 and breadth_pct <= 45:
        return "TREND_DOWN_HIGH_VOL" if (vix_value > 20 and vix_percentile > 75) else "TREND_DOWN"

    if adx_14 < 20 and abs(trend_score) < 2 and 45 < breadth_pct < 55:
        return "RANGE_BOUND"

    return "TRANSITION"
```

### Confirmation / Hysteresis
```python
MIN_CONFIRM_DAYS = 2

candidate_regime = classify_regime(
    trend_score=trend_score,
    adx_14=adx_14,
    vix_value=vix_value,
    vix_percentile=vix_percentile,
    breadth_pct=breadth_pct
)

if candidate_regime == prev_regime:
    regime = prev_regime
    candidate_regime_out = candidate_regime
    candidate_days_out = 0

elif candidate_regime == prev_candidate_regime:
    candidate_days_out = prev_candidate_days + 1
    regime = candidate_regime if candidate_days_out >= MIN_CONFIRM_DAYS else prev_regime
    candidate_regime_out = candidate_regime

else:
    regime = prev_regime
    candidate_regime_out = candidate_regime
    candidate_days_out = 1
```

### Confidence
```python
regime_components = {
    "trend": 1 if abs(trend_score) >= 3 else 0,
    "strength": 1 if adx_14 >= 25 else 0,
    "breadth": 1 if ((trend_score >= 3 and breadth_pct >= 55) or (trend_score <= -3 and breadth_pct <= 45)) else 0,
    "volatility": 1 if vix_percentile < 70 else 0
}

regime_confidence = round(sum(regime_components.values()) / 4, 2)
```

### Risk Posture Mapping
| Regime | Directional Bias Allowed | Base Risk Multiplier |
|:---|:---|:---:|
| `TREND_UP` | Long-only preferred | 1.00 |
| `TREND_DOWN` | Short-only preferred | 1.00 |
| `TREND_UP_HIGH_VOL` | Long-only selective | 0.60 |
| `TREND_DOWN_HIGH_VOL` | Short-only selective | 0.60 |
| `RANGE_BOUND` | Mean-reversion only or no-trade | 0.40 |
| `TRANSITION` | Reduce participation | 0.50 |

### Output Schema
```json
{
  "regime": "TREND_UP",
  "candidate_regime": "TREND_UP",
  "candidate_days": 2,
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

**Purpose:** Evaluate whether institutional participation, options sentiment, and sector rotation confirm or oppose the regime. This engine may strengthen, weaken, or neutralize directional conviction. It does **not** define trade size.

### Inputs
| Metric | Source | Calculation |
|:---|:---|:---|
| `fii_5d_net` | NSE Cash | Sum of last 5 sessions. |
| `fii_5d_z` | Derived | Z-score of `fii_5d_net` vs trailing 126 sessions. |
| `dii_5d_net` | NSE Cash | Sum of last 5 sessions. |
| `pcr_oi` | NSE Option Chain | Put OI / Call OI, smoothed by 3-day EMA. |
| `pcr_oi_percentile` | Derived | 252-day percentile of smoothed PCR. |
| `sector_rs_rank` | Sector indices | 20-day RS slope vs Nifty; ranked. |
| `top_inflow_sectors` | Derived | Top 3 sectors by RS slope. |
| `top_outflow_sectors` | Derived | Bottom 3 sectors by RS slope. |
| `delivery_score` | NSE Delivery | `(today_delivery_pct / median_20d_delivery) - 1`, valid only if `delivery_pct > 40%`. |
| `regime` | Regime Engine | Confirmed regime. |

### Scoring Logic
```python
flows_score = 0.0
drivers = []

# Institutional participation
if fii_5d_z >= 1.0:
    flows_score += 1.0
    drivers.append("FII_STRONG_LONG")
elif fii_5d_z <= -1.0:
    flows_score -= 1.0
    drivers.append("FII_STRONG_SHORT")

# Contrarian options sentiment
if pcr_oi_percentile >= 80:
    flows_score += 0.75
    drivers.append("PCR_CONTRARIAN_BULLISH")
elif pcr_oi_percentile <= 20:
    flows_score -= 0.75
    drivers.append("PCR_CONTRARIAN_BEARISH")

# Sector confirmation depends on regime direction
regime_aligned_long = regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
regime_aligned_short = regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]

if regime_aligned_long and len(top_inflow_sectors) > 0:
    flows_score += 0.50
    drivers.append("SECTOR_CONFIRMATION_LONG")
elif regime_aligned_short and len(top_outflow_sectors) > 0:
    flows_score -= 0.50
    drivers.append("SECTOR_CONFIRMATION_SHORT")
```

### Bias Mapping
```python
if flows_score >= 1.25:
    bias = "LONG"
elif flows_score <= -1.25:
    bias = "SHORT"
else:
    bias = "NEUTRAL"
```

### Guardrails
- `max_pain` is excluded from directional scoring; it may be stored only as expiry-context metadata.
- `dii_5d_net` is informative but non-scoring unless later evidence proves additive edge.
- If `regime` is `RANGE_BOUND` or `TRANSITION`, flows can inform caution but cannot force a strong directional action by itself.

### Output Schema
```json
{
  "bias": "LONG",
  "flows_score": 1.5,
  "fii_5d_net": 842.5,
  "fii_5d_z": 1.3,
  "dii_5d_net": 310.2,
  "pcr_oi": 1.42,
  "pcr_oi_percentile": 84,
  "top_inflow_sectors": ["AUTO", "IT", "PHARMA"],
  "top_outflow_sectors": ["METAL", "REALTY"],
  "delivery_score": 0.18,
  "drivers": ["FII_STRONG_LONG", "PCR_CONTRARIAN_BULLISH", "SECTOR_CONFIRMATION_LONG"]
}
```

---

## 3. LEADERSHIP ENGINE

**Purpose:** Identify symbols with both relative and absolute strength aligned to the current market regime. This engine determines candidates, not portfolio action.

### Universe
- F&O 200 liquid universe
- Exclude symbols failing liquidity, corporate action, or data-completeness filters

### Per-Symbol Features
| Feature | Formula | Notes |
|:---|:---|:---|
| `rs_slope_20d` | `slope(log(stock_close / nifty_close), 20d)` | Relative strength trend |
| `pct_vs_50dma` | `(close - sma50) / sma50` | Absolute trend extension |
| `pct_vs_200dma` | `(close - sma200) / sma200` | Structural trend filter |
| `volume_ratio` | `volume / sma(volume, 20)` | Participation |
| `breakout_proximity` | `(close - 20d_high) / 20d_high` | Near-breakout confirmation |
| `avg_turnover_20d` | `sma(close * volume, 20)` | Liquidity |

### Normalization
- Z-score all cross-sectional rank features.
- Clip each normalized feature to ±3.
- Do **not** mix raw and normalized values in the same composite.

### Composite Score
```python
composite_score = (
    0.45 * rs_slope_norm +
    0.20 * pct_vs_50dma_norm +
    0.15 * pct_vs_200dma_norm +
    0.10 * volume_ratio_norm +
    0.10 * breakout_proximity_norm
)
```

### Relative Ranking
1. Rank all valid symbols by `composite_score`.
2. Assign quintiles `1..5`.
3. Only quintile `5` is eligible for long candidates.
4. Only quintile `1` is eligible for short candidates.

### Absolute Filters
```python
long_eligible = (
    quintile == 5 and
    close > sma50 and
    sma50 > sma200 and
    pct_vs_200dma > 0 and
    volume_ratio >= 1.2 and
    avg_turnover_20d >= 5_00_00_000 and
    not earnings_blackout and
    sector not in top_outflow_sectors
)

short_eligible = (
    quintile == 1 and
    close < sma50 and
    sma50 < sma200 and
    pct_vs_200dma < 0 and
    volume_ratio >= 1.2 and
    avg_turnover_20d >= 5_00_00_000 and
    not earnings_blackout and
    sector not in top_inflow_sectors
)
```

### Candidate Selection
- In `TREND_UP` / `TREND_UP_HIGH_VOL`: return only `long_eligible`.
- In `TREND_DOWN` / `TREND_DOWN_HIGH_VOL`: return only `short_eligible`.
- In `RANGE_BOUND` / `TRANSITION`: suppress recommendations or mark as watchlist-only.

### Output Schema
```json
{
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
      "score": 2.11,
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
      "score": -1.88,
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

**Purpose:** Convert market risk posture and symbol volatility into permitted trade size. This engine has veto power.

### Inputs
| Metric | Source | Calculation |
|:---|:---|:---|
| `account_value` | Broker / Portfolio | Current equity |
| `account_risk_pct` | Config | Base risk per trade, default 0.75% to 1.00% |
| `instrument_atr_14` | Symbol Daily | ATR(14) of the traded symbol |
| `atr_multiplier` | Config | Stop multiple, default 1.5 |
| `lot_size` | Instrument Metadata | Exchange lot multiple |
| `day_start_equity` | Portfolio | Equity at market open |
| `equity_peak` | Portfolio | Rolling peak equity |
| `current_equity` | Portfolio | Live or EOD equity |
| `consecutive_loss_days` | Portfolio | Count of negative EOD sessions |
| `regime_base_risk_multiplier` | Regime Engine | Risk posture multiplier |

### Derived Metrics
```python
intraday_loss_pct = (day_start_equity - current_equity) / day_start_equity * 100
peak_to_date_drawdown_pct = (equity_peak - current_equity) / equity_peak * 100
stop_distance = instrument_atr_14 * atr_multiplier
```

### Raw Position Size
```python
risk_budget = account_value * (account_risk_pct / 100) * regime_base_risk_multiplier
raw_qty = risk_budget / stop_distance
position_size = floor_to_lot_size(raw_qty, lot_size)
```

### Tradeability Filters
```python
tradable = True

if position_size < lot_size:
    tradable = False

if stop_distance / entry_price > 0.04:
    tradable = False

if avg_turnover_20d < 5_00_00_000:
    tradable = False
```

### Circuit Breakers
```python
if intraday_loss_pct >= 1.5 or peak_to_date_drawdown_pct >= 6.0:
    circuit_breaker = "HALTED"
elif intraday_loss_pct >= 1.0 or peak_to_date_drawdown_pct >= 4.0 or consecutive_loss_days >= 3:
    circuit_breaker = "REDUCED"
else:
    circuit_breaker = "ACTIVE"
```

### Final Size
```python
if circuit_breaker == "HALTED" or not tradable:
    final_position_size = 0
elif circuit_breaker == "REDUCED":
    final_position_size = floor_to_lot_size(position_size * 0.5, lot_size)
else:
    final_position_size = position_size
```

### Output Schema
```json
{
  "instrument_atr_14": 52.4,
  "atr_multiplier": 1.5,
  "stop_distance": 78.6,
  "account_risk_pct": 0.75,
  "regime_base_risk_multiplier": 1.0,
  "intraday_loss_pct": 0.4,
  "peak_to_date_drawdown_pct": 2.1,
  "consecutive_loss_days": 1,
  "circuit_breaker": "ACTIVE",
  "tradable": true,
  "final_position_size": 250
}
```

---

## 5. AI ADVISOR SHELL

**Purpose:** Aggregate engine outputs into an action recommendation. Advisor is an orchestration layer only. It must not re-score raw features already consumed upstream.

### Inputs
- `regime`
- `regime_confidence`
- `flows.bias`
- `flows.flows_score`
- `leaders.leader_count_q5`
- `leaders.laggard_count_q1`
- `risk.circuit_breaker`
- `risk.tradable`
- `risk.final_position_size`

### Voting Logic
```python
votes = {
    "regime": 0.35 * (
        1 if regime in ["TREND_UP", "TREND_UP_HIGH_VOL"]
        else -1 if regime in ["TREND_DOWN", "TREND_DOWN_HIGH_VOL"]
        else 0
    ),
    "flows": 0.25 * (
        1 if flows_bias == "LONG"
        else -1 if flows_bias == "SHORT"
        else 0
    ),
    "leadership": 0.25 * (
        1 if leader_count_q5 >= 3
        else -1 if laggard_count_q1 >= 3
        else 0
    ),
    "risk": 0.15 * (
        1 if circuit_breaker == "ACTIVE" and tradable
        else 0
    )
}

direction_vote = sum(votes.values())

if direction_vote > 0:
    direction = "LONG"
    agreement_count = sum(1 for v in votes.values() if v > 0)
elif direction_vote < 0:
    direction = "SHORT"
    agreement_count = sum(1 for v in votes.values() if v < 0)
else:
    direction = "NEUTRAL"
    agreement_count = 0

confidence = min(abs(direction_vote), 1.0)
```

### Conflict Rules
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

### Confidence Adjustments
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

### Action Mapping
```python
if circuit_breaker == "HALTED" or not tradable:
    action = "NO_TRADE"
elif confidence >= 0.65 and agreement_count >= 3:
    action = direction
elif confidence >= 0.50 and agreement_count >= 2:
    action = f"{direction}_SMALL"
else:
    action = "NO_TRADE"
```

### Reasoning Template
```python
reasoning = [
    f"Regime={regime}, confidence={regime_confidence}",
    f"Flows bias={flows_bias}, flows_score={flows_score}",
    f"Leadership: Q5 leaders={leader_count_q5}, Q1 laggards={laggard_count_q1}",
    f"Risk: circuit_breaker={circuit_breaker}, tradable={tradable}, size={final_position_size}"
]

if conflicts:
    reasoning.append(f"Conflicts={','.join(conflicts)}")
```

### Output Schema
```json
{
  "direction": "LONG",
  "action": "LONG",
  "confidence": 0.72,
  "agreement_count": 4,
  "votes": {
    "regime": 0.35,
    "flows": 0.25,
    "leadership": 0.25,
    "risk": 0.15
  },
  "conflicts": [],
  "reasoning": [
    "Regime=TREND_UP, confidence=1.0",
    "Flows bias=LONG, flows_score=1.5",
    "Leadership: Q5 leaders=6, Q1 laggards=7",
    "Risk: circuit_breaker=ACTIVE, tradable=true, size=250"
  ],
  "top_recommendations": [
    {
      "symbol": "RELIANCE",
      "direction": "LONG",
      "position_size": 250,
      "score": 2.11,
      "reason": "Q5 leader, absolute uptrend, sector not in outflows"
    }
  ],
  "model_tier": 1,
  "timestamp": "2026-04-25T10:00:00Z"
}
```

---

## 6. REALTIME + UI RULES

**Purpose:** Publish one coherent engine snapshot per run and display state cleanly without implying execution certainty.

### Table Architecture
- `stock_scores`: per-symbol detail for audit/debug
- `signals_summary`: one row per engine run for frontend subscription

### `signals_summary` schema
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
run_ts      timestamptz NOT NULL,
regime      jsonb NOT NULL,
flows       jsonb NOT NULL,
leaders     jsonb NOT NULL,
risk        jsonb NOT NULL,
ai_advisor  jsonb NOT NULL,
created_at  timestamptz DEFAULT now()
```

### Frontend Rules
- Subscribe only to `signals_summary`.
- Render latest row only.
- If `run_ts` is stale by >15 min during market hours, show delayed badge.
- If `ai_advisor.action == "NO_TRADE"`, do not visually imply a directional recommendation.
- If `regime` contains `_HIGH_VOL`, display reduced risk status, not blanket directional disablement.
- Show “watchlist-only” badge in `RANGE_BOUND` and `TRANSITION`.