# SteadyAlpha — Requirements (Single-User Trading Copilot)

## Phase 1: Data Reliability & Signal Engines
- **REQ-101:** Data sources must have a documented hierarchy and validation (freshness, nulls, sanity).
- **REQ-102:** Regime engine must confirm state changes only after 2 consecutive days of confirmation (hysteresis).
- **REQ-103:** Flows engine must incorporate FII/DII net, PCR percentile, and Sector RS.
- **REQ-104:** Leadership engine must use Z-score normalized RS slope (20d) for ranking F&O 200 universe.
- **REQ-105:** `signals_summary` must provide a single-row snapshot of all engine outputs.

## Phase 2: Signal Dashboard & Advisor
- **REQ-201:** UI must provide dedicated cards for Regime, Flows, Leadership, and Risk.
- **REQ-202:** AI Advisor must synthesize engine outputs into Action recommendations with confidence scores.
- **REQ-203:** Dashboard must highlight delta (changes) in signals since the previous run.

## Phase 3: Automated Paper Execution
- **REQ-301:** `paper_orders` and `paper_trades` tables must track tool-generated trade lifecycle.
- **REQ-302:** Promotion logic must gate paper trades by regime, confidence, and risk state.
- **REQ-303:** UI must allow inspection of every paper trade including its source signal and sizing basis.

## Phase 4: Performance Review & Broker Hardening
- **REQ-401:** Performance metrics must be segmented by regime, setup type, and confidence bucket.
- **REQ-402:** Broker adapter must be architecturally isolated from signal generation logic.
- **REQ-403:** System must implement a hardware/software kill switch and max daily loss guardrails.

## Phase 5: Constrained Live Automation
- **REQ-501:** System must support assisted-live mode (manual approval) and constrained live-auto mode.
- **REQ-502:** UI must show real-time broker execution events and P&L for live positions.

---
*Last updated: 2026-04-25*
