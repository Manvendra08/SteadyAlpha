# Phase 1: Data Reliability & Signal Engines - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Source:** PRD (steadyalpha-single-user-trading-copilot-plan.md)

<domain>
## Phase Boundary
This phase builds the analytical foundation of the Trading Copilot. It focuses on making data trustworthy and implementing the core engines for Regime, Flows, and Leadership.

Deliverables:
- Data validation layer (hierarchy, freshness, sanity checks).
- Regime Engine (hysteresis-based state assessment).
- Flows Engine (Institutional, PCR, and Sector flows).
- Leadership Engine (Z-score normalized RS slope ranking).
- `signals_summary` table persistence.

</domain>

<decisions>
## Implementation Decisions

### Data Reliability
- Implement a `SourceHierarchy` for each dataset.
- Classify data health as `fresh`, `stale`, `degraded`, or `missing`.
- Confidence levels in signals MUST be reduced if data is stale or missing.

### Regime Engine
- Use a 2-day hysteresis gate to prevent "saw-toothing" state changes.
- States: Bullish, Bearish, Range, Volatile.

### Flows Engine
- Aggregate FII/DII net flows.
- Track PCR (Put-Call Ratio) percentiles.
- Calculate Sector RS (Relative Strength).

### Leadership Engine
- Universe: F&O 200 stocks.
- Ranking: Z-score normalized RS slope (20-day window).

</decisions>

<canonical_refs>
## Canonical References
- `steadyalpha-single-user-trading-copilot-plan.md` — Product definition and build order.
- `ROADMAP.md` — Milestone 1 goals.
- `REQUIREMENTS.md` — REQ-101 to REQ-105.

</canonical_refs>

<specifics>
## Specific Ideas
- The `signals_summary` should be a single row per run, optimized for frontend subscription.
- Every engine run must store diagnostics in an `engine_audit` table.

</specifics>

<deferred>
## Deferred Ideas
- UI components (Dashboard cards) are deferred to Phase 2.
- Paper trading logic is deferred to Phase 3.
- Broker integration is deferred to Phase 4.

</deferred>

---
*Phase: 01-data-reliability-signal-engines*
