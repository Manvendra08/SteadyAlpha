# Signal Engine & Dashboard - Technical Specification

Version: v0.6.1  
Date: 2026-04-26  
Phase: Stage 1.6 - Professional Retail Signal Quality + Options Paper Trading  
Primary user: experienced Indian retail positional trader  
Decision style: EOD primary, hourly monitoring secondary, options paper automation allowed  
Stack target: GitHub Actions or local scheduler -> Supabase -> Next.js dashboard
Revision note: v0.6.1 closes review gaps in vote logic, IV lookback, SHOCK tagging, invalidation rules, DII scoring, short approval, and intraday discovery escalation.

---

## 0. Product Intent

SteadyAlpha is a decision cockpit for a serious retail trader. It must reduce bad trades, surface high-quality setups, manage open positions, and create an audit trail.

Core output:

```text
Trade Permission: YES / SMALL / NO
Market Bias: LONG / SHORT / NEUTRAL
Best Setups: ranked list with entry zone, stop, size, invalidation
Options View: IV, PCR, OI zones, skew, sellable structures
Paper Options: automated spread paper orders from approved alerts
Open Positions: hold / add / reduce / exit
Hourly Alerts: setup approaching / invalidated / risk changed
What Changed: today vs previous run
```

Non-goals:

- No autonomous live trading.
- No intraday scalping system.
- No unlicensed data redistribution.
- No ML until rule-based edge is proven.
- No signal if data quality is weak.
- No naked option selling in live mode.

Principles:

- Signal quality > signal count.
- No trade is a valid output.
- EOD decides; hourly monitors.
- Risk veto beats all signals.
- Every recommendation must explain why it exists and when it is invalid.
- Options selling starts paper-only, spread-only, index-first.

---

## 1. Operating Cadence

| Cadence | Time IST | Purpose | Trade Authority |
|---|---:|---|---|
| EOD run | 16:45-17:30 | Official signal generation | Can create next-day trade plan |
| Pre-open run | 08:45-09:05 | Gap/risk check | Can downgrade/cancel plan |
| Hourly run | 10:15, 11:15, 12:15, 13:15, 14:15 | Opportunity/risk monitoring | Can alert, not create unvalidated trades |
| Options paper trigger | after approved EOD/hourly alert | Create simulated spread orders | Paper-only |
| Close watch | 15:00-15:20 | End-session confirmation | Can flag missed/late setups |
| Weekly review | Weekend | Trader review and rule improvement | No trade output |

Hourly monitoring is allowed only for:

- planned setup approaching entry zone
- breakout confirmation on already approved watchlist
- options chain confirmation for approved alerts
- stop/invalidated setup
- regime/risk shock
- position management alert

Hourly monitoring must not create fresh trades from symbols that failed EOD quality gates.

---

## 2. Data Source Policy

### 2.1 Legality Levels

| Level | Meaning | Allowed Use |
|---|---|---|
| A | Official download/API with clear permission | Production, audit, backtest |
| B | Broker-account API for own account/use | Hourly monitor, personal trading workflow |
| C | Free third-party API with API key and terms | Research/fallback only unless terms allow production |
| D | Website scraping where terms prohibit automation | Blocked |
| E | Unofficial reverse-engineered endpoints | Blocked |

### 2.2 Source Matrix

| Data | Preferred Source | Free/Gated | Cadence | Notes |
|---|---|---:|---|---|
| NSE equity EOD OHLCV | NSE All Reports / UDiFF bhavcopy | Free official download | EOD | Do not scrape if terms prohibit automation. Use licensed feed if automated production requires it. |
| BSE equity EOD OHLCV | BSE Bhav Copy | Free official download | EOD | Good fallback/cross-check for listed equities. |
| Nifty index OHLC | NSE historical index data | Free official page/download | EOD | Use for regime and benchmark. |
| India VIX | NSE historical VIX | Free official page/download | EOD | Required for high-vol regime. |
| FPI/FII flows | NSDL FPI reports, SEBI curation links | Free official | EOD | Use confirmed/provisional flag. |
| Sector FPI | NSDL/SEBI sector-wise FPI | Free official | Fortnightly | Use only as slow context, not daily trigger. |
| Corporate actions | NSE/BSE corporate action reports | Free official | EOD | Blackout gate. |
| Results dates | NSE/BSE announcements | Free official | EOD | Blackout gate; manual verification allowed. |
| Hourly OHLCV | Dhan / Upstox / Kite broker APIs | Account-gated | Intraday | Use personal API tokens; no redistribution. |
| Historical intraday | Dhan / broker API | Account-gated | Backtest | Validate coverage and limits. |
| Option chain live | Dhan / Upstox broker APIs | Account-gated | Intraday | Preferred for option selling paper engine. |
| Option OI/Greeks/IV | Dhan / Upstox broker APIs | Account-gated | Intraday | Vendor Greeks must be stored with provider/version. |
| NSE option chain UI/CSV | NSE website | Free official UI | Manual/reference only | Do not automate unless terms/license allow it. |
| Options margin | Broker margin API / SPAN file if available | Account/licensed | Pre-trade | Required for paper margin simulation. |
| Alpha Vantage | Alpha Vantage API | Free key / limited | Research fallback | Verify NSE symbol support and entitlement before use. |
| Yahoo/yfinance | Yahoo-derived community access | Unofficial | Research only | Not authoritative for live decisions. |

### 2.3 Hard Data Rules

- Store source, URL/provider, fetch time, exchange timestamp, license level, checksum.
- Block signal if primary and secondary sources disagree beyond tolerance.
- Never mix adjusted and unadjusted prices in the same calculation.
- Corporate-action adjustments must be versioned.
- Free source use must be reviewed quarterly.
- If source terms conflict with automation/backtesting/simulation, mark source `BLOCKED_FOR_AUTOMATION`.
- Option chain snapshots must store expiry, strike, bid/ask, OI, volume, IV, Greeks, and provider timestamp.
- Options paper trades require bid/ask, liquidity, margin estimate, and max-loss estimate.

### 2.4 Source References

- NSE All Reports: https://www.nseindia.com/all-reports
- NSE terms: https://www.nseindia.com/static/nse-terms-of-use
- NSE historical index data: https://www.nseindia.com/reports-indices-historical-index-data
- NSE India VIX history: https://www.nseindia.com/reports-indices-historical-vix
- BSE Bhav Copy: https://www.bseindia.com/markets/MarketInfo/BhavCopy.aspx
- NSDL FPI statistics: https://nsdl.com/web/en/node/438
- SEBI FPI curation: https://www.sebi.gov.in/curation/fpi.html
- Dhan historical data: https://dhanhq.co/docs/v2/historical-data/
- Dhan option chain: https://dhanhq.co/docs/v2/option-chain/
- Upstox intraday candles: https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/
- Upstox option chain: https://upstox.com/developer/api-documentation/get-pc-option-chain/
- Kite historical candles: https://kite.trade/docs/connect/v3/historical/
- Alpha Vantage docs: https://www.alphavantage.co/documentation/

---

## 3. System Architecture

```text
Data Ingestion
  -> Data Quality Gate
  -> Feature Store
  -> Regime Engine
  -> Flows Engine
  -> Options Analysis Engine
  -> Leadership Engine
  -> Setup Quality Engine
  -> Risk & Sizing Engine
  -> Decision Aggregator
  -> Options Selling Paper Engine
  -> Position Lifecycle Engine
  -> Journal & Review Engine
  -> Dashboard / Alerts
```

Execution order:

```text
Data Quality -> Regime -> Flows -> Options Analysis -> Leadership -> Setup Quality -> Risk -> Decision -> Options Paper -> Position Lifecycle
```

All outputs require:

```json
{
  "run_id": "uuid",
  "engine_version": "git_sha_or_semver",
  "run_ts_utc": "timestamp",
  "market_ts_ist": "timestamp",
  "source_quality": "PASS|DEGRADED|FAIL"
}
```

---

## 4. Data Quality Gate

### 4.1 Purpose

Prevent bad trades from bad data.

### 4.2 Checks

| Check | Rule | Failure Action |
|---|---|---|
| Freshness | EOD data <= 1 trading day old | Fail EOD signal |
| Completeness | >= 95% universe valid | Degrade below 95%, fail below 80% |
| Duplicate bars | no duplicate symbol/date | Fail affected symbols |
| Corporate action gap | split/bonus adjusted correctly | Block symbol |
| Source agreement | primary vs fallback close diff <= 0.25% | Flag/reject symbol |
| Volume sanity | volume not zero unless suspended | Reject symbol |
| Intraday coverage | hourly bar available for watched symbols | Degrade hourly only |
| Option chain freshness | provider timestamp within configured delay | Block options paper engine |
| Option quote sanity | bid <= ask, non-zero quote for selected legs | Block affected spread |
| Option liquidity | min OI/volume/depth and max spread | Block affected leg |
| Option Greeks availability | delta/theta/vega/gamma present for selected legs | Block options selling |
| Option margin availability | broker margin or max-loss estimate available | Block options paper order |

### 4.3 Output

```json
{
  "status": "PASS",
  "coverage_pct": 98.5,
  "blocked_symbols": ["ABC"],
  "warnings": ["FPI_DATA_T_PLUS_1"],
  "source_health": {
    "nse_eod": "PASS",
    "bse_eod": "PASS",
    "broker_intraday": "DEGRADED",
    "broker_option_chain": "PASS"
  }
}
```

---

## 5. Regime Engine

Purpose: classify market state and trade permission baseline.

Inputs:

- Nifty 50 EOD OHLC
- EMA20, EMA50, EMA200
- ADX14
- India VIX value and percentile
- F&O 200 breadth
- prior confirmed regime
- prior candidate regime

States:

```text
TREND_UP
TREND_DOWN
TREND_UP_HIGH_VOL
TREND_DOWN_HIGH_VOL
RANGE_BOUND
TRANSITION
SHOCK
```

`SHOCK` is triggered by:

- Nifty gap/down move > configured shock threshold
- VIX percentile spike > configured threshold
- market-wide breadth collapse
- active manual event tag with `shock_override: true`

Manual SHOCK workflow:

```json
{
  "event_id": "uuid",
  "created_by": "trader",
  "created_at_ist": "2026-04-26T08:30:00+05:30",
  "event_type": "POLICY|WAR|ELECTION|EXCHANGE_OUTAGE|BROKER_OUTAGE|OTHER",
  "severity": "WATCH|RISK_REDUCE|SHOCK",
  "shock_override": true,
  "expires_at_ist": "2026-04-27T15:30:00+05:30",
  "reason": "RBI event risk before market open"
}
```

Rules:

- Only the trader can create, extend, or cancel manual event tags.
- Manual SHOCK requires expiry timestamp; no open-ended override.
- Manual event tags are stored in `manual_market_events`.
- If `severity = SHOCK` and `shock_override = true`, regime becomes `SHOCK` until expiry or cancellation.
- Dashboard must show active manual SHOCK reason and expiry.

Trade permission:

| Regime | Permission | Base Risk |
|---|---|---:|
| TREND_UP | Long allowed | 1.00 |
| TREND_DOWN | Short allowed, optional | 0.50 |
| TREND_UP_HIGH_VOL | Long selective | 0.60 |
| TREND_DOWN_HIGH_VOL | Short selective, optional | 0.40 |
| RANGE_BOUND | No new positional trades | 0.25 |
| TRANSITION | No new trades | 0.25 |
| SHOCK | No new trades, manage risk | 0.00 |

Default product mode:

```yaml
trading_mode:
  long_enabled: true
  short_enabled: false
```

Shorts require separate backtest approval.

Short approval gate:

| Gate | Minimum |
|---|---:|
| Out-of-sample short trades | 75 |
| Short-only profit factor | >= 1.20 |
| Short-only max drawdown | <= 10% |
| Avg short trade R | > 0 |
| Regime segment loss | no enabled short regime negative after 30+ trades |
| Paper short review | 30 calendar days with no risk-rule breach |

Approval workflow:

- System can recommend `SHORT_WATCH`, but cannot output `SHORT` or `SHORT_SMALL` while `short_enabled = false`.
- Enabling shorts requires `short_approval_record_id` in config.
- Approval record stores backtest run id, paper review date range, metrics, and trader confirmation.
- Only the trader can approve; no automatic promotion to short-enabled mode.

---

## 6. Flows Engine

Purpose: confirm or weaken regime using institutional and derivatives context.

Inputs:

- FPI/FII cash flow 5d and 20d
- DII flow 5d and 20d if available
- FPI derivative positioning if available
- PCR OI percentile if licensed/available
- sector relative strength spread
- regime

Rules:

- FPI cash flow is a confirmation input, not standalone trade trigger.
- DII absorption reduces bearish penalty from FPI selling.
- PCR is contrarian only at extremes.
- Sector flow data is slow context unless source is daily and reliable.

Scoring:

```text
fpi_z = zscore(fpi_5d_net, lookback = flows.fii_z_lookback_sessions)
dii_z = zscore(dii_5d_net, lookback = flows.dii_z_lookback_sessions)
net_inst_z = zscore(fpi_5d_net + dii_5d_net, lookback = flows.inst_z_lookback_sessions)

flows_score =
  fpi_component +
  dii_absorption_component +
  net_inst_component +
  pcr_component +
  sector_component
```

Components:

| Component | Rule |
|---|---|
| `fpi_component` | `+1.0` if `fpi_z >= fii_z_strong`; `-1.0` if `fpi_z <= -fii_z_strong`; else `0` |
| `dii_absorption_component` | `+0.40` if `fpi_z < 0` and `dii_z >= dii_absorption_z`; `-0.25` if `fpi_z > 0` and `dii_z <= -dii_absorption_z`; else `0` |
| `net_inst_component` | `+0.35` if `net_inst_z >= inst_z_strong`; `-0.35` if `net_inst_z <= -inst_z_strong`; else `0` |
| `pcr_component` | `+0.75` at high PCR percentile; `-0.75` at low PCR percentile |
| `sector_component` | `+0.50` or `-0.50` only when sector RS spread is meaningful and regime-aligned |

DII rule:

- DII cannot create a standalone directional signal.
- DII can reduce FPI-selling bearishness when domestic buying absorbs outflow.
- DII can slightly reduce bullishness when FPI buying is offset by domestic selling.
- If DII data is stale/missing, set DII components to `0` and add `DII_DATA_MISSING`.

Output:

```json
{
  "bias": "LONG|SHORT|NEUTRAL",
  "flows_score": 0.85,
  "fpi_5d_z": -1.2,
  "dii_5d_z": 1.1,
  "net_inst_z": -0.2,
  "drivers": ["FPI_SELLING_ABSORBED", "NET_INST_NEUTRAL"],
  "data_grade": "A|B|C",
  "usable_for_trade": true
}
```

If `data_grade` < B, flows can reduce confidence but cannot increase action size.

---

## 6A. Options Analysis Engine

Purpose: add derivatives evidence before equity/futures decisions and feed paper options-selling automation.

Scope:

- Nifty, Bank Nifty, Fin Nifty first.
- Liquid stock options only after index option paper results pass.
- Use account-gated broker APIs for automated option-chain pulls.
- NSE option-chain UI is reference/manual unless licensed automation is allowed.

Inputs:

| Input | Required | Use |
|---|---:|---|
| option chain by expiry | Yes | strikes, OI, volume, bid/ask |
| Greeks | Yes for selling | delta, gamma, theta, vega |
| IV by strike | Yes | richness, skew, IV rank |
| underlying spot/future | Yes | moneyness, expected move |
| previous OI | Yes | writing/unwinding |
| hourly option quote | Yes for paper automation | fill simulation |
| expiry calendar | Yes | DTE filter |

Derived metrics:

| Metric | Meaning |
|---|---|
| `pcr_oi` | total put OI / call OI |
| `pcr_volume` | put volume / call volume |
| `atm_iv` | nearest ATM IV |
| `iv_rank` | current IV vs configured trading-session IV range |
| `iv_percentile` | percentile of IV over configured trading-session lookback |
| `iv_hv_ratio` | ATM IV / 20d realized volatility |
| `expected_move_pct` | ATM straddle premium / underlying |
| `call_wall` | highest valid call OI zone |
| `put_wall` | highest valid put OI zone |
| `oi_shift` | major OI build/unwind since prior snapshot |
| `skew_score` | put IV minus call IV at same delta |
| `liquidity_score` | spread, depth, volume, OI |

Lookback policy:

- IV lookback is trading sessions, not calendar days.
- Default: `options_analysis.iv_lookback_sessions = 252`.
- If fewer than `iv_min_sessions = 126` valid sessions exist, set `iv_data_grade = DEGRADED`.
- If fewer than 60 valid sessions exist, block option selling and set `blocked_reason = INSUFFICIENT_IV_HISTORY`.

Interpretation:

| Condition | Meaning |
|---|---|
| Put writing below spot + bullish regime | supports bullish bias |
| Call writing above spot + bearish regime | supports bearish bias |
| IV rank high + stable regime | option selling conditions improve |
| IV rank low | option selling blocked or reduced |
| wide bid/ask | option trade blocked |
| large OI wall near entry direction | equity/futures setup downgraded |
| gamma/expiry risk high | option selling blocked |

Options evidence score:

```text
options_evidence_score = IV regime + OI alignment + liquidity + skew + DTE quality - event/expiry risk
```

Score bands:

| Score | Label | Action |
|---:|---|---|
| >= 75 | STRONG | Can support option spread paper order |
| 60-74 | VALID | Can support equity/futures signal |
| 45-59 | MIXED | Reduce evidence score |
| < 45 | WEAK | Block option selling |

Output:

```json
{
  "underlying": "NIFTY",
  "expiry": "2026-04-30",
  "dte": 4,
  "options_bias": "BULLISH|BEARISH|RANGE|VOL_SELL|NO_EDGE",
  "options_evidence_score": 78,
  "atm_iv": 13.4,
  "iv_rank": 71,
  "iv_percentile": 68,
  "iv_hv_ratio": 1.28,
  "pcr_oi": 1.18,
  "call_wall": 22800,
  "put_wall": 22200,
  "expected_move_pct": 1.05,
  "liquidity_score": 86,
  "drivers": ["PUT_WRITING_SUPPORT", "IV_RICH", "LIQUID_CHAIN"],
  "blocked_reason": null
}
```

Hard blocks:

- option chain stale
- missing bid/ask
- missing Greeks for selling
- liquidity score < 70
- IV rank < 40 for premium-selling setups
- DTE outside configured range
- event risk not priced/flagged
- bid/ask spread above threshold
- expiry-day selling unless explicitly enabled

---

## 7. Leadership Engine

Purpose: identify market leaders/laggards from a liquid universe.

Universe default:

- F&O 200 or Nifty 500 liquid subset
- exclude illiquid symbols
- exclude corporate-action blackout
- exclude earnings blackout
- exclude symbols with insufficient history

Features:

| Feature | Use |
|---|---|
| 20d relative strength slope vs Nifty | Primary leadership |
| 60d relative strength slope | Persistence |
| Price vs 50DMA/200DMA | Absolute trend filter |
| Volume ratio vs 20d median | Participation |
| Turnover | Liquidity |
| Breakout proximity | Timing |
| Sector rank | Context |
| Volatility compression/expansion | Setup readiness |

Ranking:

- Rank by composite score.
- Q1 = top performers.
- Q5 = bottom performers.
- Store full rank history.

Output:

```json
{
  "leader_count_q1": 12,
  "laggard_count_q5": 8,
  "leaders": [],
  "laggards": [],
  "universe_coverage": 196
}
```

---

## 8. Setup Quality Engine

Purpose: convert leaders into tradeable setups. This is the main signal-quality layer.

### 8.1 Setup Types

| Setup | Long Logic | Preferred Regime |
|---|---|---|
| Breakout | close above 20d/55d range with volume | TREND_UP |
| Pullback | leader pulls to 20EMA/50DMA and holds | TREND_UP |
| Tight base | low volatility consolidation near highs | TREND_UP |
| Reclaim | recovers key MA after failed breakdown | TREND_UP_HIGH_VOL |
| Avoid | extended, thin, event-risk, conflicting | Any |

### 8.2 Quality Score

`setup_quality_score` in `[0, 100]`.

Weights:

| Component | Weight |
|---|---:|
| Regime alignment | 20 |
| Relative strength rank | 20 |
| Absolute trend | 15 |
| Liquidity/turnover | 10 |
| Volume confirmation | 10 |
| Entry proximity | 10 |
| Stop quality | 10 |
| Event risk clean | 5 |

Hard reject:

- setup score < 70
- stop distance > max allowed
- reward:risk < 1.8
- earnings/corporate blackout
- source quality fail
- symbol already over-correlated with open positions

### 8.3 Entry Zone

Long entry zone:

```text
breakout_entry = trigger_price to trigger_price * 1.005
pullback_entry = support_zone_low to support_zone_high
```

No chasing rule:

```text
if current_price > trigger_price * 1.015:
    status = "MISSED_DO_NOT_CHASE"
```

### 8.4 Stop

Stop is max of:

- technical invalidation level
- ATR stop
- swing low/high

Reject if:

```text
stop_pct > max_stop_pct
```

### 8.5 Invalidation Rules

`invalidation_display` is human text only. Programmatic checks use `invalidation_rules`.

Rule schema:

```json
{
  "rule_id": "price_close_below_stop",
  "type": "PRICE|RS_RANK|VOLUME|REGIME|OPTIONS|EVENT",
  "metric": "close",
  "operator": "<",
  "threshold": 2390.0,
  "timeframe": "1D",
  "confirmation": "CLOSE",
  "action": "INVALIDATE_SETUP"
}
```

Supported operators:

```text
<, <=, >, >=, ==, !=, IN, NOT_IN, CROSSES_BELOW, CROSSES_ABOVE
```

Rules:

- Every actionable setup requires at least one `PRICE` invalidation rule.
- RS invalidation uses numeric rank/quintile fields, not prose.
- Hourly monitor can trigger `SETUP_INVALIDATED` only from structured rules.
- Display text is generated from structured rules when possible.

### 8.6 Output

```json
{
  "symbol": "RELIANCE",
  "direction": "LONG",
  "setup_type": "PULLBACK",
  "setup_quality_score": 82,
  "entry_zone": [2450.0, 2462.0],
  "stop_price": 2390.0,
  "target_zone": [2570.0, 2630.0],
  "reward_risk": 2.1,
  "status": "ACTIONABLE|WATCH|MISSED_DO_NOT_CHASE|REJECTED",
  "invalidation_display": "Close below 2390 or RS quintile drops below Q2",
  "invalidation_rules": [
    {
      "rule_id": "price_close_below_stop",
      "type": "PRICE",
      "metric": "close",
      "operator": "<",
      "threshold": 2390.0,
      "timeframe": "1D",
      "confirmation": "CLOSE",
      "action": "INVALIDATE_SETUP"
    },
    {
      "rule_id": "rs_quintile_worse_than_q2",
      "type": "RS_RANK",
      "metric": "rs_quintile",
      "operator": ">",
      "threshold": 2,
      "timeframe": "1D",
      "confirmation": "CLOSE",
      "action": "DOWNGRADE_TO_WATCH"
    }
  ],
  "reasons": [
    "Q1 relative strength",
    "above 50DMA and 200DMA",
    "volume expansion",
    "clean event window"
  ]
}
```

---

## 9. Hourly Opportunity Monitor

Purpose: avoid missed opportunities without turning the product into a noisy intraday system.

Eligible symbols:

- EOD actionable setups
- EOD watchlist setups with score >= 65
- current open positions

Hourly inputs:

- 60-minute OHLCV
- current price
- intraday VWAP
- day high/low
- relative volume
- gap from previous close
- index intraday trend
- option-chain delta/OI/IV snapshot for approved underlyings

Alert types:

| Alert | Trigger |
|---|---|
| ENTRY_APPROACHING | price within 0.5% of entry zone |
| ENTRY_CONFIRMED | hourly close confirms trigger with volume |
| DO_NOT_CHASE | price extended beyond chase limit |
| SETUP_INVALIDATED | structured `invalidation_rules` evaluate true |
| STOP_NEAR | open position within 0.5 ATR of stop |
| RISK_REDUCED | market/risk state downgraded |
| LATE_DAY_CONFIRMATION | valid setup confirms near close |
| OPTIONS_SELL_READY | signal alert + option chain + risk gates pass |
| OPTIONS_SELL_BLOCKED | signal alert passes but option risk/liquidity fails |
| OPTIONS_EXIT_ALERT | paper option spread hits exit rule |

Hourly alert rules:

- Max 1 active alert per symbol per hour.
- No alert if source stale.
- No fresh symbol discovery intraday unless user enables `intraday_discovery`.
- Hourly signal cannot override EOD risk veto.
- Alert must state action: prepare, enter, wait, cancel, reduce, exit.
- Options paper orders may be generated only from `ENTRY_CONFIRMED` or `OPTIONS_SELL_READY`.

Intraday discovery escalation:

- Default remains `intraday_discovery_enabled = false`.
- Enabling requires `intraday_discovery_approval_record_id`.
- Approval requires shadow-mode tracking for at least `approval_gates.intraday_discovery_shadow_days`.
- Shadow mode records discovered symbols but cannot alert or create paper orders.
- Approval metrics: false alert rate, missed opportunity improvement, chase-trade count, and risk-rule breaches.
- If approved, discovery is limited to the existing liquid universe and max 3 discovery alerts per day.
- Intraday discovery still cannot bypass data quality, regime permission, setup score, or risk veto.

Output:

```json
{
  "symbol": "RELIANCE",
  "alert": "ENTRY_APPROACHING",
  "action": "PREPARE",
  "price": 2454.0,
  "entry_zone": [2450.0, 2462.0],
  "expires_at_ist": "2026-04-27T15:20:00+05:30"
}
```

---

## 10. Risk & Sizing Engine

Purpose: convert approved setups into allowed size.

Inputs:

- account equity
- open positions
- day start equity
- peak equity
- risk mode
- setup stop distance
- lot size if derivative
- sector exposure
- correlation exposure
- paper options max loss
- paper options margin used
- net short delta/gamma exposure

Defaults:

```yaml
risk:
  account_risk_pct: 0.50
  max_account_risk_pct: 0.75
  max_open_positions: 6
  max_new_positions_per_day: 2
  max_sector_exposure_pct: 35
  max_single_position_pct: 20
  max_options_risk_pct: 2.0
  max_options_risk_pct_per_trade: 0.75
  halt_drawdown_pct: 6
  reduce_drawdown_pct: 4
  max_stop_pct: 5
```

Sizing:

```text
risk_budget = equity * account_risk_pct * regime_multiplier * setup_quality_multiplier
qty = floor(risk_budget / abs(entry - stop))
```

Setup multiplier:

| Setup Quality | Multiplier |
|---|---:|
| >= 85 | 1.00 |
| 75-84 | 0.75 |
| 70-74 | 0.50 |
| < 70 | 0.00 |

Circuit breaker:

| State | Rule |
|---|---|
| ACTIVE | normal sizing |
| REDUCED | new size * 0.5 |
| HALTED | no new trades |

Options risk rules:

- Max loss must be known before paper entry.
- Total open paper options max loss <= configured options risk budget.
- Reject if margin estimate unavailable.
- Reject if net short gamma exceeds configured limit.
- Reject if underlying exposure duplicates existing position risk.

Output:

```json
{
  "tradable": true,
  "position_size": 120,
  "capital_required": 294000,
  "risk_amount": 7200,
  "risk_pct_equity": 0.5,
  "options_risk_available": true,
  "options_margin_available": true,
  "circuit_breaker": "ACTIVE"
}
```

---

## 11. Decision Aggregator

Purpose: produce final action from approved inputs.

Decision hierarchy:

```text
Data Quality FAIL -> NO_TRADE
Risk HALTED -> NO_TRADE
Regime disallows direction -> NO_TRADE
Setup score < 70 -> NO_TRADE
Reward:risk < 1.8 -> NO_TRADE
Options selling requires Options Analysis score >= configured threshold
Then vote/regime/flows/leadership decide size class
```

Directional vote formula:

```text
regime_vote =
  +w_regime if regime in [TREND_UP, TREND_UP_HIGH_VOL]
  -w_regime if regime in [TREND_DOWN, TREND_DOWN_HIGH_VOL]
   0 otherwise

flows_vote =
  +w_flows if flows.bias = LONG
  -w_flows if flows.bias = SHORT
   0 otherwise

leadership_vote =
  +w_leadership if leader_count_q1 >= min_leaders_for_vote
  -w_leadership if laggard_count_q5 >= min_leaders_for_vote
   0 otherwise

direction_vote = regime_vote + flows_vote + leadership_vote

market_bias =
  LONG if direction_vote >= vote_long_threshold
  SHORT if direction_vote <= -vote_short_threshold
  NEUTRAL otherwise
```

Default weights:

```yaml
decision_aggregator:
  w_regime: 0.45
  w_flows: 0.30
  w_leadership: 0.25
  vote_long_threshold: 0.35
  vote_short_threshold: 0.35
```

Evidence score:

```text
base_evidence = abs(direction_vote) * 100
setup_bonus = min(setup_quality_score - 70, 15) if setup_quality_score >= 70 else -100
options_adjustment = +5 if options_evidence_score >= 75 and options_bias aligns else -10 if options_bias conflicts else 0
conflict_penalty = 15 for regime/flows conflict, 10 for leadership/sector conflict
evidence_score = clamp(base_evidence + setup_bonus + options_adjustment - conflict_penalty, 0, 100)
```

Options analysis adjusts evidence and paper-spread eligibility. It does not create market direction by itself.

Action values:

```text
LONG
LONG_SMALL
SHORT
SHORT_SMALL
WATCH
HOLD
REDUCE
EXIT
NO_TRADE
PAPER_SELL_SPREAD
PAPER_EXIT_SPREAD
```

Default production mode:

- longs enabled
- shorts disabled until validated
- live derivatives disabled until explicit config
- options paper selling enabled only after broker option-chain data is configured

Output:

```json
{
  "action": "LONG_SMALL",
  "market_bias": "LONG",
  "trade_permission": "SMALL",
  "confidence_label": "HIGH_EVIDENCE",
  "evidence_score": 78,
  "top_recommendations": [],
  "no_trade_reason": null,
  "what_changed": [
    "Regime stayed TREND_UP",
    "Flows improved from NEUTRAL to LONG",
    "RELIANCE setup moved from WATCH to ACTIONABLE"
  ]
}
```

Do not use the word `confidence` as probability. Use `evidence_score`.

---

## 11A. Automated Options Selling Paper Engine

Purpose: simulate professional options-selling trades triggered by signal engines. This is paper-only.

Default scope:

- index options only
- credit spreads only
- no naked short options
- no live order placement
- no expiry-day selling by default
- no averaging losers

Allowed strategies:

| Strategy | Trigger | Structure |
|---|---|---|
| Bull Put Credit Spread | LONG or LONG_SMALL + bullish options evidence | sell OTM put, buy lower-strike hedge put |
| Bear Call Credit Spread | SHORT or SHORT_SMALL + bearish options evidence | sell OTM call, buy higher-strike hedge call |
| Iron Condor | RANGE_BOUND + high IV + clear OI range | sell OTM call/put, buy both hedges |

Strategy blocks:

- naked short call
- naked short put
- undefined max loss
- low liquidity
- IV too low
- DTE outside range
- option chain stale
- no margin estimate
- event risk active
- underlying near OI wall against trade

Entry trigger:

```text
approved_signal
AND hourly alert in [ENTRY_CONFIRMED, OPTIONS_SELL_READY]
AND options_evidence_score >= min_options_evidence_score
AND liquidity_score >= min_option_liquidity_score
AND risk engine ACTIVE or REDUCED
AND simulated_margin_available
```

Strike selection:

| Field | Default |
|---|---:|
| short delta | 0.15-0.30 |
| hedge width | 1-3 strikes |
| DTE | 7-30 calendar days |
| minimum credit | >= 25% of spread width preferred |
| max loss per trade | <= 0.75% equity |
| max total options risk | <= 2.0% equity |

Fill model:

```text
credit = short_leg_bid - long_leg_ask - slippage
max_loss = spread_width - credit
margin_used = broker_margin_estimate if available else max_loss * lot_size
```

Conservative simulation:

- sell at bid
- buy hedge at ask
- include brokerage, exchange charges, GST, STT, stamp duty
- reject if net credit <= 0
- reject if bid/ask spread too wide

Exit rules:

| Exit | Rule |
|---|---|
| Profit take | buy back at 50%-70% of max credit |
| Stop loss | loss reaches 1.0x to 1.5x credit |
| Signal reversal | regime/decision flips against spread |
| Short strike breach | underlying closes beyond short strike |
| DTE exit | exit before configured min DTE |
| IV shock | IV spike beyond threshold |
| Data fail | exit or freeze based on risk policy |

Paper order schema:

```json
{
  "paper_order_id": "uuid",
  "source_signal_id": "uuid",
  "underlying": "NIFTY",
  "strategy": "BULL_PUT_CREDIT_SPREAD",
  "expiry": "2026-05-07",
  "legs": [
    {"side": "SELL", "type": "PE", "strike": 22200, "qty": 75, "fill": 82.5, "delta": -0.22},
    {"side": "BUY", "type": "PE", "strike": 22100, "qty": 75, "fill": 48.0, "delta": -0.14}
  ],
  "net_credit": 34.5,
  "max_loss": 65.5,
  "lot_size": 75,
  "margin_used": 4912.5,
  "risk_pct_equity": 0.35,
  "status": "OPEN_PAPER",
  "entry_reason": "LONG_SMALL + PUT_WRITING_SUPPORT + IV_RICH",
  "exit_plan": "take 60% credit or exit if short strike breached"
}
```

Automation rule:

```text
Engine may auto-create paper orders.
Engine must never place live broker orders.
Live options selling requires separate approval, audit, and kill switch.
```

---

## 12. Position Lifecycle Engine

Purpose: manage open trades after entry.

States:

```text
PLANNED
OPEN
HOLD
ADD_ALLOWED
REDUCE
EXIT_PENDING
EXITED
INVALIDATED
```

Daily checks:

- stop hit
- target hit
- trailing stop update
- paper option spread P&L, Greeks, margin, short-strike distance
- regime flip
- RS deterioration
- sector deterioration
- event risk entered
- position exceeds planned risk

Exit priority:

| Priority | Exit |
|---:|---|
| 1 | hard stop |
| 2 | data/risk halt |
| 3 | setup invalidation |
| 4 | option short-strike breach |
| 5 | regime flip |
| 6 | target/partial profit |
| 7 | time stop |

Partial profit rule:

```text
At +1R: optional reduce 25%-50%, move stop to breakeven only if backtest validates.
At +2R: target zone / trail.
```

Output:

```json
{
  "symbol": "RELIANCE",
  "state": "HOLD",
  "action": "HOLD",
  "stop_price": 2390,
  "unrealized_r": 0.8,
  "reason": "Trend intact; RS still Q1"
}
```

---

## 13. Trader Journal & Review Engine

Purpose: improve trader execution, not only system logic.

Required fields:

| Field | Values |
|---|---|
| signal_id | uuid |
| trader_action | taken / skipped / modified |
| skip_reason | late / capital / low conviction / event / discretionary |
| entry_quality | planned / chased / early / late |
| exit_quality | rule-based / panic / delayed / discretionary |
| mistake_type | none / chase / oversize / ignored stop / ignored no-trade |
| result_r | numeric |

Weekly report:

- expectancy
- win rate
- avg R
- max drawdown
- best regime
- worst regime
- skipped winners
- avoided losers
- paper options win rate, expectancy, max drawdown
- option spread rule violations
- rule violations
- current system trust score

---

## 14. Dashboard Specification

Main screen sections:

1. Market State
2. Trade Permission
3. Today Actions
4. Top Setups
5. Options Analysis
6. Paper Options Orders
7. Open Positions
8. Hourly Alerts
9. What Changed
10. No-Trade Reasons
11. Data Health
12. Journal Review

Top setup card:

```text
Symbol
Direction
Setup type
Evidence score
Entry zone
Stop
Size
Reward:risk
Invalidation
Reasons
Hourly status
Options evidence
Paper options action
Option sell block reason
```

Options panel:

```text
Underlying
Expiry
IV rank
PCR
Call wall
Put wall
Expected move
Best allowed paper spread
Blocked reason
```

No-trade screen:

```text
NO TRADE
Reason: TRANSITION regime + weak leadership + poor reward:risk
Next watch: wait for TREND_UP confirmation or Q1 expansion
```

Alert delivery:

- dashboard realtime
- email optional
- Telegram/WhatsApp optional only if terms and credentials are configured
- alert deduplication required

---

## 15. Persistence

Tables:

| Table | Purpose | Retention |
|---|---|---:|
| run_registry | every run | indefinite |
| approval_records | trader approvals for shorts/intraday discovery/live changes | indefinite |
| manual_market_events | manual risk/SHOCK event tags | indefinite |
| source_snapshots | source metadata/checksum | indefinite |
| data_quality_history | quality gate results | indefinite |
| signals_summary | latest UI payload | indefinite |
| regime_history | regime audit | indefinite |
| flows_history | flows audit | indefinite |
| options_chain_snapshots | option-chain source snapshots | 180 days |
| options_analysis_history | OI/IV/skew/evidence outputs | 365 days |
| stock_scores | symbol scores | 180 days |
| setup_candidates | setup detail | 365 days |
| hourly_alerts | intraday alerts | 180 days |
| paper_options_orders | simulated spread orders | indefinite |
| paper_options_legs | simulated option legs | indefinite |
| paper_options_marks | mark-to-market trail | 365 days |
| positions | lifecycle state | indefinite |
| journal_entries | trader actions | indefinite |
| review_reports | weekly/monthly stats | indefinite |

Each recommendation must be reconstructable from stored data and config.

---

## 16. Backtest & Validation

Minimum data:

- 5 years EOD
- 2 years intraday hourly if hourly alerts affect decisions
- 2 years option-chain snapshots or broker historical option data for options paper validation
- option bid/ask, OI, volume, IV, Greeks, expiry, lot size, charges
- full corporate-action adjustment history
- delisted/suspended symbol handling where available
- source lineage stored

Backtest modes:

| Mode | Purpose |
|---|---|
| EOD-only | validate core signal edge |
| EOD + hourly monitor | validate opportunity/missed-trade impact |
| Long-only | default approval gate |
| Short-only | separate approval gate |
| Position lifecycle | validate exits and holds |
| Options analysis only | validate OI/IV evidence against market direction |
| Options paper selling | validate spread entries/exits/margin/P&L |
| Options stress replay | gap, IV spike, expiry, event-day scenarios |

Bias controls:

- no lookahead
- no survivorship-only universe without disclosure
- next-session open entry
- realistic slippage
- brokerage/taxes modeled
- option spreads filled conservatively: sell bid, buy ask
- option margin modeled from broker if available, else max-loss approximation
- symbol suspension handling
- parameter freeze before out-of-sample

Success gates:

| Metric | Gate |
|---|---:|
| Out-of-sample Sharpe | >= 0.8 |
| Profit factor | >= 1.2 |
| Max drawdown | <= 15% |
| Trade count | >= 100 preferred, 50 minimum |
| Avg R | > 0 |
| Rule violation impact | reported |
| Long-only edge | required before paper trading |
| Short-only edge | required before shorts enabled |
| Hourly alert benefit | improves missed opportunity or risk control without overtrading |
| Options paper expectancy | positive after costs |
| Options max drawdown | within configured options risk budget |
| Options loss tail | no single paper trade exceeds max planned loss |

Reject rules:

- any regime with negative expectancy after 30+ trades gets disabled
- any setup type with negative expectancy after 30+ trades gets disabled
- low evidence score trades are blocked if expectancy negative
- hourly alerts are reduced if they increase chase trades
- option selling disabled if spread strategy expectancy is negative after 50+ trades
- naked option selling remains blocked until separately approved

---

## 17. Configuration

```yaml
product:
  mode: professional_retail
  eod_primary: true
  hourly_monitoring: true
  intraday_discovery: false

trading_mode:
  long_enabled: true
  short_enabled: false
  derivatives_enabled: false
  options_paper_selling_enabled: true
  live_options_selling_enabled: false
  naked_options_enabled: false
  short_approval_record_id: null

data_policy:
  block_prohibited_scraping: true
  require_source_license_level: "B"
  allow_research_only_sources: false

regime:
  shock_gap_pct: 2.0
  shock_vix_percentile_jump: 15
  shock_breadth_collapse_pct: 30
  manual_events_enabled: true
  manual_event_max_hours: 48

flows:
  fii_z_lookback_sessions: 252
  dii_z_lookback_sessions: 252
  inst_z_lookback_sessions: 252
  fii_z_strong: 1.0
  dii_absorption_z: 0.75
  inst_z_strong: 0.75

decision_aggregator:
  w_regime: 0.45
  w_flows: 0.30
  w_leadership: 0.25
  vote_long_threshold: 0.35
  vote_short_threshold: 0.35
  full_action_evidence_score: 75
  small_action_evidence_score: 60

setup_quality:
  min_actionable_score: 70
  min_watch_score: 65
  min_reward_risk: 1.8
  chase_limit_pct: 1.5

risk:
  account_risk_pct: 0.50
  max_account_risk_pct: 0.75
  max_stop_pct: 5.0
  max_open_positions: 6
  max_new_positions_per_day: 2
  max_sector_exposure_pct: 35
  halt_drawdown_pct: 6
  reduce_drawdown_pct: 4

hourly_monitor:
  interval_minutes: 60
  eligible_only_from_eod_watchlist: true
  intraday_discovery_enabled: false
  max_alerts_per_symbol_per_day: 4
  entry_approach_pct: 0.5
  stop_near_atr: 0.5
  intraday_discovery_approval_record_id: null

options_analysis:
  enabled: true
  underlyings: ["NIFTY", "BANKNIFTY", "FINNIFTY"]
  iv_lookback_sessions: 252
  iv_min_sessions: 126
  min_iv_rank_for_selling: 40
  min_options_evidence_score: 75
  min_option_liquidity_score: 70
  max_bid_ask_spread_pct: 5
  min_oi_contracts: 1000
  min_volume_contracts: 500
  allow_nse_ui_automation: false

options_paper_selling:
  enabled: true
  spread_only: true
  allowed_strategies:
    - BULL_PUT_CREDIT_SPREAD
    - BEAR_CALL_CREDIT_SPREAD
    - IRON_CONDOR
  min_dte: 7
  max_dte: 30
  short_delta_min: 0.15
  short_delta_max: 0.30
  min_credit_pct_width: 25
  profit_take_pct_credit: 60
  stop_loss_multiple_credit: 1.25
  max_risk_pct_equity_per_trade: 0.75
  max_total_options_risk_pct_equity: 2.0
  block_expiry_day_selling: true
  auto_create_paper_orders: true
  live_order_placement: false

backtest:
  min_years_eod: 5
  min_years_intraday: 2
  min_years_options: 2
  slippage_bps_per_side: 5
  brokerage_tax_model: true
  min_trades_preferred: 100

approval_gates:
  short_min_oos_trades: 75
  short_min_profit_factor: 1.20
  short_max_drawdown_pct: 10
  short_paper_review_days: 30
  intraday_discovery_shadow_days: 20
  intraday_discovery_max_false_alert_rate_pct: 35
```

---

## 18. Stage Plan

### Stage 1.5 - Signal Quality

- Data quality gate
- source registry
- setup quality engine
- no-trade reasons
- what-changed panel

### Stage 2 - Paper Trading

- journal
- position lifecycle
- paper orders
- paper options order simulator
- weekly review

### Stage 3 - Hourly Monitor

- broker API connector
- hourly alerts
- option-chain hourly snapshots
- open-position risk monitor
- missed opportunity analysis

### Stage 3.5 - Options Paper Automation

- options analysis engine
- spread strategy selector
- margin/risk simulator
- automated paper spread entries/exits
- options-specific review report

### Stage 4 - Production Hardening

- licensed data decision
- alert delivery
- audit exports
- disaster recovery
- live options selling remains blocked unless explicitly approved

---

## 19. Acceptance Checklist

- [ ] No signal if data quality fails.
- [ ] Every trade has entry, stop, size, invalidation, reason.
- [ ] No-trade reason always shown.
- [ ] EOD and hourly outputs are separate.
- [ ] Hourly cannot create unapproved fresh trades by default.
- [ ] Decision aggregator implements explicit regime/flows/leadership vote formula.
- [ ] IV rank/percentile lookback uses configured trading sessions.
- [ ] Manual SHOCK tags require trader, reason, expiry, and audit record.
- [ ] Invalidation checks use structured `invalidation_rules`, not free text.
- [ ] DII absorption scoring is implemented and cannot create standalone direction.
- [ ] Long-only backtest passes before paper trading.
- [ ] Shorts disabled until separately validated.
- [ ] Shorts cannot be enabled without `short_approval_record_id`.
- [ ] Intraday discovery cannot be enabled without shadow-mode approval.
- [ ] Source legality level stored for every dataset.
- [ ] NSE/BSE/NSDL/SEBI usage reviewed against current terms.
- [ ] Broker API token flow implemented securely.
- [ ] Option chain source supports bid/ask, OI, IV, Greeks, expiry, lot size.
- [ ] Options analysis engine stores OI zones, IV rank, skew, liquidity, expected move.
- [ ] Automated options selling is paper-only.
- [ ] Paper options engine creates spread-only orders by default.
- [ ] Naked option selling is blocked.
- [ ] Paper options fills use conservative bid/ask model.
- [ ] Paper options margin and max loss are stored.
- [ ] Paper options exits are automated by profit, loss, signal reversal, DTE, and short-strike breach.
- [ ] Journal captures taken/skipped/modified signals.
- [ ] Journal separates equity/futures trades from options spread paper trades.
- [ ] Weekly review reports expectancy and rule violations.
- [ ] Weekly review reports options paper expectancy and worst loss.
- [ ] Dashboard shows what changed since previous run.
