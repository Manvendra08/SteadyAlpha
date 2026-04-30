# SteadyAlpha Data Source Strategy Spec
## Shoonya (Finvasia) Primary + Hybrid yfinance/NSE Secondary

## Purpose
This document defines the production data-source strategy for SteadyAlpha using:
- **Primary**: Shoonya (Finvasia) APIs
- **Secondary**: hybrid `yfinance` + NSE reports/files fallback stack

The objective is to reduce data-fetch failure rates, improve operational reliability, and move away from fragile mock-based fallbacks.

## Why this strategy
Shoonya provides documented trading and market APIs, WebSocket support, symbol-master access, rate-limit guidance, and SDKs, making it a viable primary broker-linked data source for a custom trading stack. [web:66][web:97]  
Shoonya also documents historical market-data access through time-price-series and daily-price-series APIs, which makes it materially more useful than a broker that only exposes order endpoints. [web:79]  
As a secondary layer, NSE publishes historical reports and archives including India VIX and other market reports, which makes NSE files/reports a stronger fallback layer than random wrappers alone. [web:82][web:84][web:81]

## Design goal
The system should:
- prefer Shoonya for live and broker-linked market data,
- use `yfinance` for broad OHLCV convenience where acceptable,
- use NSE reports/files for exchange-grounded fallback,
- use internal persisted state for risk/equity,
- and never substitute random mock data into trading logic.

## Non-negotiable rules
1. Random mock data is banned from the trading path.
2. If Shoonya fails, the system must try fallback sources before marking a dataset unavailable.
3. Fallbacks must be persisted with provenance and validity status.
4. Critical feeds must invalidate the run if no trading-valid source is available.
5. Internal risk state must come from SteadyAlpha trade/equity history, not external market-data vendors.

## Source hierarchy
### Primary layer
- Shoonya REST API
- Shoonya WebSocket API
- Shoonya historical series endpoints
- Shoonya symbol master and market-info endpoints

Shoonya publicly documents market APIs, WebSocket support, symbol-master access, and rate-limit guidance. [web:66][web:97]

### Secondary layer
- `yfinance` for index/stock OHLCV convenience
- NSE reports / historical archives / bhavcopy-style exchange files
- controlled NSE scraping only where stable files/endpoints are unavailable

NSE publishes historical reports, including India VIX historical data and broader archived reports, which makes it suitable as an exchange-grounded fallback for end-of-day use cases. [web:82][web:84][web:81]

## Dataset-by-dataset strategy

### 1. Nifty 50 OHLCV
**Primary**
- Shoonya historical/daily price-series API for NIFTY-linked instrument or mapped symbol

**Secondary**
- `yfinance` using `^NSEI`
- NSE historical/index reports if needed for reconstruction
- cached last valid real snapshot

**Use**
- regime engine
- baseline market structure
- ATR-derived logic if applicable

**Validity rule**
- trading-valid if Shoonya or fallback returns schema-valid OHLCV with required lookback
- invalid if no valid OHLCV exists

## 2. India VIX
**Primary**
- Shoonya source if symbol/instrument mapping supports India VIX data retrieval

**Secondary**
- NSE India VIX historical reports
- `yfinance` convenience fallback for `^INDIAVIX`
- cached last valid real snapshot

NSE publishes India VIX historical data and product information, which makes it the most credible fallback for VIX history. [web:81][web:85]

**Use**
- regime engine
- VIX percentile
- volatility override logic

**Validity rule**
- if unavailable in primary, fallback to NSE historical VIX source
- hardcoded VIX constants are forbidden

## 3. FII Cash Flows
**Primary**
- Shoonya if exposed directly in market-info or derivative/cash-market datasets

**Secondary**
- NSE reports/files or report-parsing pipeline
- controlled page extraction from official NSE report surfaces if file/structured API route is unavailable
- cached last valid real snapshot marked stale if needed

NSE publishes report surfaces that can support market-stat-style retrieval, though this may require report parsing rather than clean API use. [web:82]

**Use**
- flows engine

**Validity rule**
- if unavailable, flows must degrade or become invalid depending on strategy configuration

## 4. DII Cash Flows
**Primary**
- Shoonya if supported

**Secondary**
- NSE reports/files
- controlled parser against official report surfaces
- cached last valid snapshot

**Use**
- supporting flow context

**Validity rule**
- important but may remain noncritical if the decision model is configured accordingly

## 5. PCR OI
**Primary**
- Shoonya option-chain / market snapshot data if sufficient for put/call OI aggregation

**Secondary**
- NSE option-chain/report extraction
- controlled scraping of official option-chain surfaces
- cached last valid real snapshot

Shoonya positions itself as providing market-data APIs and the developer ecosystem includes option-related access, but exact completeness for your PCR/max-pain needs must be validated empirically before trusting it as sole source. [web:96][web:97]

**Use**
- flows engine
- options sentiment logic

**Validity rule**
- only trading-valid if required OI fields are available and parser validation passes

## 6. Max Pain / OI Distribution
**Primary**
- Shoonya option-chain data if strike-wise OI is sufficiently complete

**Secondary**
- NSE option-chain/report extraction
- controlled official-page parsing
- cached last valid snapshot

**Use**
- flows context
- spot-vs-max-pain relation

**Validity rule**
- mark important-noncritical or critical depending on actual strategy dependency

## 7. Sector Indices
**Primary**
- Shoonya sector/index market data if accessible and mapped properly

**Secondary**
- `yfinance` sector/index tickers
- NSE index reports or index-history files
- cached last valid snapshot

**Use**
- sector alignment
- rotation context

**Validity rule**
- degrade if missing; do not invalidate the whole run unless decision logic depends directly on sector gating

## 8. Universe OHLCV (F&O 200 or configured tradable universe)
**Primary**
- Shoonya historical series for the configured universe

**Secondary**
- `yfinance` batched fetch
- NSE bhavcopy/reports + reconstruction
- persisted historical store by symbol

**Use**
- leadership engine
- breadth
- stock ranking

**Validity rule**
- must meet minimum coverage threshold
- if coverage too low, leadership becomes degraded or invalid

## 9. Account Equity / Drawdown
**Primary**
- internal Supabase trade ledger and paper/live portfolio state

**Secondary**
- Shoonya positions/holdings/limits only when live integration is active and explicitly trusted

Shoonya API docs and SDK materials show holdings, positions, and limits support, which can later assist broker-linked state checks. [web:97]

**Use**
- risk engine
- drawdown gating
- paper/live promotion control

**Validity rule**
- risk must rely primarily on internal truth state, not vendor market-feed availability

## Recommended criticality model
### Critical for decision
- Nifty 50 OHLCV
- India VIX
- PCR OI if PCR is part of vote
- Universe OHLCV if leadership is part of vote

### Critical for risk
- Account equity / drawdown
- ATR/sizing inputs derived from valid OHLCV

### Important noncritical
- DII cash flows
- sector indices
- max pain if used as contextual modifier only

## System architecture
### Adapter layout
Implement source adapters like this:
- `adapters/shoonya_market.py`
- `adapters/shoonya_history.py`
- `adapters/shoonya_option_chain.py`
- `adapters/yfinance_prices.py`
- `adapters/nse_reports.py`
- `adapters/nse_option_chain.py`
- `adapters/risk_state.py`

### Common adapter contract
```python
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class FetchResult:
    dataset_key: str
    provider: str
    source_type: str
    freshness: str
    trading_valid: bool
    criticality: str
    success: bool
    market_date: Optional[str]
    fetched_at: Optional[str]
    record_count: Optional[int]
    payload: Any
    warning: Optional[str] = None
    error: Optional[str] = None
```

## Source selection logic
For each dataset:
1. try Shoonya primary adapter
2. validate schema and content
3. if failed, try secondary hybrid source
4. if secondary fails, load last valid cached real snapshot if policy permits
5. if still unavailable and dataset is critical, invalidate run
6. persist provenance and invalid reasons

## Session/auth strategy for Shoonya
Shoonya API use requires active account access and API authentication flow. Shoonya’s FAQ states an active trading account is needed to generate API authentication keys. [web:77]

### Implementation requirements
- store API credentials in GitHub Actions secrets or secure runtime secret manager
- build login/session bootstrap in pipeline init step
- refresh tokens/session per run where required
- isolate authentication failures from dataset validation failures
- log rate-limit and auth errors separately

## Reliability rules
### Rule 1
A successful fetch is not enough. The payload must pass dataset validation.

### Rule 2
Shoonya remains primary only if empirical stability is proven over repeated scheduled runs.

### Rule 3
If Shoonya provides incomplete option-chain fields for PCR/max-pain, downgrade it to partial-primary for that dataset and keep NSE fallback as authoritative.

### Rule 4
`yfinance` is acceptable for convenience OHLCV, but it should not be the sole source for trading-critical validation where exchange-grounded fallback exists.

### Rule 5
NSE report/file parsing should be preferred over uncontrolled scraping where possible.

## Validation requirements by dataset
### OHLCV
Must include:
- date/time
- open
- high
- low
- close
- volume
- enough lookback for indicators

### PCR / option chain
Must include:
- strike-level or aggregate OI fields needed by logic
- timestamp/market-date context
- sufficient completeness for put/call aggregation

### FII / DII
Must include:
- numeric net values
- market date
- source provenance

### Risk state
Must include:
- current equity or portfolio value
- realized/unrealized P&L where needed
- drawdown inputs
- timestamp

## Cache policy
Cache only validated real/fallback/scraped payloads.

Never cache:
- random values
- hardcoded placeholders
- schema-invalid responses

Recommended cached items:
- latest valid Nifty OHLCV series
- latest valid India VIX series
- latest valid option-chain snapshot
- latest valid FII/DII daily values
- latest valid universe price snapshots

## Run validity policy
### Trading-valid run
Set `Run Valid for Trading = YES` only if:
- critical Shoonya or fallback feeds succeeded and validated
- risk inputs are valid
- no critical source is mock or missing

### Partial run
Set `PARTIAL` if:
- diagnostics are useful,
- some important but noncritical feeds degraded,
- trading promotion remains restricted depending on policy

### Invalid run
Set `NO` if:
- any critical dataset is unavailable,
- option-chain/PCR is invalid where required,
- risk state is unavailable,
- or only mock/synthetic values exist

## Recommended Supabase persistence
Persist for every run:
- run validity
- trading permissions
- paper promotion permissions
- source registry rows
- invalid reason rows
- cache metadata

This should align with the ingestion provenance schema already specified in the ingestion/fallback architecture document.

## Operational recommendation
### Best practical setup for SteadyAlpha
Use this exact stance:
- Shoonya = primary for broker-linked market and account ecosystem
- `yfinance` = secondary for OHLCV convenience and rapid recovery
- NSE reports/files = authoritative fallback for exchange-backed history and EOD recovery
- internal Supabase state = risk/account truth

This is stronger than relying on wrappers alone, and cheaper than going fully paid-vendor from day one.

## Known caveats
- Shoonya’s documented APIs are real, but you still need to validate field completeness and runtime stability in your own scheduled environment before treating it as authoritative for all datasets. [web:66][web:97][web:79]
- Shoonya marketing pages describe free APIs and market-data support, but you should still verify live account eligibility, limits, and any changed commercial terms before treating “free” as guaranteed. [web:96][web:99][web:77]
- NSE fallbacks are reliable for historical/report-style recovery, but they are not a substitute for low-latency broker-linked live feeds. [web:82][web:84]

## Build order
1. Implement Shoonya auth + session bootstrap.
2. Implement Shoonya Nifty/history adapter.
3. Implement Shoonya option-chain adapter and validate fields for PCR/max-pain.
4. Implement Shoonya positions/limits adapter for future broker-linked state.
5. Implement `yfinance` OHLCV fallback adapter.
6. Implement NSE VIX/report fallback adapter.
7. Implement NSE report parser for FII/DII.
8. Add cache + provenance + run-validity gating.
9. Disable all random mock fallbacks.
10. Run 5-day scheduled stability test before trusting for paper promotion.

## Acceptance criteria
This strategy is acceptable only when:
- Shoonya successfully provides primary data for at least Nifty OHLCV and core live market coverage,
- secondary hybrid fallback works automatically when Shoonya fails,
- critical datasets never silently downgrade to mock,
- provenance clearly shows primary vs fallback use,
- and the run-validity gate blocks paper/live promotion when critical feeds fail.

## Final recommendation
Use Shoonya as the operational primary source only if your own scheduled-run evidence proves it stable enough.

Treat it as **primary by architecture, not by faith**.

The hybrid fallback stack is not optional. It is what makes the system survivable when the broker API or session layer breaks.
