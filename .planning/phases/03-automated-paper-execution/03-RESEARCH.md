# Phase 3: Automated Paper Execution - Research

## Objective
Define deterministic paper-order lifecycle design and operator visibility for promotion, rejection, and trade outcomes.

## Inputs Reviewed
- [`steadyalpha-single-user-trading-copilot-plan.md`](steadyalpha-single-user-trading-copilot-plan.md)
- [`steadyalpha-master-roadmap.md`](steadyalpha-master-roadmap.md)
- [`REQUIREMENTS.md`](.planning/REQUIREMENTS.md)
- [`pipeline/engines/advisor.py`](pipeline/engines/advisor.py:18)
- [`config/default.yaml`](config/default.yaml:1)

## 1. Promotion Gate Defaults
Selected baseline for this phase:
- Tradable regime only `bullish` or `bearish`.
- Confidence threshold `>= 60`.
- Risk halt must be `false`.
- Sizing uses fixed risk percent from [`risk.base_risk_pct`](config/default.yaml:5).

## 2. Paper Lifecycle Model
### `paper_orders`
Purpose: store promotion decision per candidate signal.

Core fields:
- lineage: `run_id`, source signal identifiers.
- intent: `symbol`, `direction`, `requested_qty`.
- decision: `status` as `pending` or `rejected`.
- explainability: `rejection_reason`, `sizing_basis`, `confidence_at_entry`.

### `paper_trades`
Purpose: store simulated position lifecycle.

Core fields:
- lineage: `paper_order_id`, `run_id`.
- execution assumptions: `entry_price`, `slippage_bps`, `simulation_version`.
- lifecycle: open at entry, closed at exit with `exit_reason` and `pnl`.

## 3. Determinism and Idempotency
- One promotion evaluation per run and candidate setup.
- Persist both accepted and rejected outcomes.
- Re-running same inputs must produce same promotion decision and sizing basis.

## 4. UI Inspection Requirements
For every paper record, UI must show:
- source signal and run lineage,
- reason for entry or rejection,
- confidence at entry,
- sizing basis,
- current status and timestamps.

---
*Research complete: 2026-04-25*

