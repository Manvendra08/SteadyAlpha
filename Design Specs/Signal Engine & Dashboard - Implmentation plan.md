# v0.6 Implementation Plan

## Summary
Build v0.6 simulation-first: implement signal-quality, options analysis, dashboard, and automated paper options-selling before live broker wiring. Use adapter interfaces and deterministic mocks now; add Upstox as the first credible free broker-data candidate later, because Upstox advertises free market/data APIs and exposes option-chain Greeks. Keep NSE option-chain UI manual/reference only because NSE terms restrict aggregation/duplication. Dhan remains secondary because its data APIs may be paid.

## Key Implementation Changes

### Pipeline + Contracts
- Normalize persistence around `run_registry.run_id`; stop using the legacy `runs.id` path. Add a compatibility migration instead of destructive schema changes.
- Add canonical engine payloads: `data_quality`, `options_analysis`, `setup_quality`, `hourly_alerts`, `paper_options_orders`, `position_lifecycle`, `journal_review`.
- Add config sections from v0.6: `product`, `trading_mode`, `data_policy`, `setup_quality`, `options_analysis`, `options_paper_selling`, `hourly_monitor`.
- Replace `pd.np` mock generation with `np` and keep mock data deterministic via seeded fixtures.

### Engines
- Add `DataQualityEngine`: freshness, coverage, source legality level, option quote sanity, bid/ask sanity, Greeks/margin availability.
- Add `OptionsAnalysisEngine`: PCR, OI walls, OI shift, IV rank/percentile, IV/HV ratio, expected move, skew, liquidity score, options evidence score.
- Add `SetupQualityEngine`: setup type, score, entry zone, stop, reward/risk, invalidation, no-chase rejection, event/liquidity blocks.
- Extend `Advisor` into the v0.6 decision aggregator: use `evidence_score`, no-trade reasons, trade permission, options evidence, and action values including `PAPER_SELL_SPREAD`.
- Add `OptionsPaperSellingEngine`: spread-only simulated orders, conservative fills, max-loss/margin checks, profit/stop/DTE/signal-reversal exits. Block naked selling and all live orders.

### Data + Adapters
- Define `MarketDataAdapter` and `OptionsDataAdapter` interfaces with mock implementations first.
- Use source policy:
  - EOD: NSE/BSE/NSDL/SEBI official download paths where permitted.
  - Automated option chain: adapter-only now; Upstox first candidate, Dhan secondary.
  - NSE option-chain UI: manual/reference only.
- Store source metadata for every snapshot: provider, license level, timestamp, checksum, automation permission.

### Database + Dashboard
- Add tables: `source_snapshots`, `data_quality_history`, `options_chain_snapshots`, `options_analysis_history`, `setup_candidates`, `hourly_alerts`, `paper_options_orders`, `paper_options_legs`, `paper_options_marks`, `journal_entries`, `review_reports`.
- Update `signals_summary` to include v0.6 JSONB blobs while preserving existing regime/flows/leadership/risk/advisor cards.
- Update dashboard from mock-only to typed data props, then add panels: Options Analysis, Paper Options Orders, No-Trade Reasons, What Changed, Data Health.
- Keep UI dense and trader-focused: no marketing layout, no explanatory filler.

## Test Plan
- Unit tests:
  - data quality blocks stale/illegal/missing option data
  - options analysis computes OI walls, PCR, IV rank, liquidity, expected move
  - setup quality rejects low score, bad reward/risk, chase entries
  - paper options engine creates only defined-risk spreads
  - naked option selling and live orders are impossible by config and code
- Integration tests:
  - full mock EOD run writes all v0.6 payloads
  - hourly alert can trigger paper spread only from approved setup
  - risk halt blocks equity and options paper orders
  - persistence uses `run_registry.run_id` consistently
- Frontend tests/build:
  - dashboard renders no-trade state, options panel, paper spread table, data health
  - no overflow/overlap on desktop and mobile widths
- Backtest readiness:
  - add deterministic fixture datasets for EOD, hourly, and option-chain snapshots
  - include conservative option fill model: sell bid, buy ask, charges, max loss

## Assumptions
- First delivery is simulation-first, not live broker-ready.
- Default broker candidate for future free automated option-chain data is Upstox; sources: [Upstox option chain](https://upstox.com/developer/api-documentation/get-pc-option-chain), [Upstox API access](https://upstox.com/trading-api/).
- Dhan remains supported as a later adapter, but not default for free data because Dhan states data APIs can be paid; sources: [Dhan option chain](https://dhanhq.co/docs/v2/option-chain/), [Dhan API pricing note](https://knowledge.dhan.co/support/solutions/articles/82000891151-are-dhan-apis-free-).
- NSE option-chain automation is blocked unless terms/licensing permit it; source: [NSE option chain terms notice](https://www.nseindia.com/market-data/option-chain).
- Live options selling stays out of scope. Paper-only, spread-only, index-first.
