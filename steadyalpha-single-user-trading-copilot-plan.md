# SteadyAlpha — Single-User Trading Copilot Plan

## Purpose
This plan defines SteadyAlpha as a single-user trading copilot for a personal trader.

It is **not** just a learning tool.
It is designed to:
1. generate market signals,
2. convert qualified signals into tool-generated paper trades,
3. let the user monitor paper performance and signal quality,
4. and then move toward broker-connected automation in a controlled way.

The product must stay honest: paper trading is paper trading, and live automation should be earned through evidence.

## Core objective
The most critical outcome is **signal quality**.

Everything else exists to support that goal:
- signal generation,
- signal review,
- paper execution,
- performance tracking,
- and eventual live automation.

If signals are weak, broker integration only scales bad decisions faster.

## Product definition
SteadyAlpha for a single user should be:
- a signal engine,
- a paper-trading executor,
- a performance monitor,
- and later a broker-connected execution layer.

It should not begin as:
- a multi-user SaaS product,
- a generic journaling app,
- a pure dashboard with no trading consequences,
- or an ML-heavy platform before baseline edge is proven.

## Product progression
The correct progression is:
1. Signal engine and dashboard.
2. Tool-generated paper trades.
3. Paper performance review and promotion rules.
4. Broker-readiness hardening.
5. Constrained live automation.
6. Broader live automation only if results remain stable.

This is still staged, but it is not passive. It is a progression from evidence to controlled automation.

## Non-negotiable operating principles
### 1. Signal quality first
No stage should distract from whether the signals are actually worth acting on.

### 2. User visibility is mandatory
The user must always be able to see what the tool is doing, why it is doing it, what changed, and whether it is in paper mode or live mode.

### 3. Automation must be narrow before it becomes broad
Live automation should begin with limited symbol scope, reduced size, and strict eligibility rules.

### 4. Controls stay even for single-user use
Single-user does not mean no discipline. It only means less enterprise workflow.

## Required user visibility
The system must give the user direct visibility into these questions at all times:

### Market and signal visibility
- What is the current regime?
- What is the directional bias?
- Which signals are aligned and which are conflicted?
- Which stocks are top-qualified candidates?
- What confidence level is attached to each recommendation?
- What changed since the previous run?

### Data visibility
- When did the last successful run happen?
- Which data inputs are fresh, stale, degraded, or missing?
- Did the current signal use fallback data?
- Was any confidence reduced because of missing or stale data?

### Paper-trade visibility
- Which paper trades were opened by the tool?
- Why was each paper trade created?
- What signal snapshot triggered it?
- What stop logic, target logic, and sizing logic were applied?
- Which trades were rejected or skipped, and why?

### Performance visibility
- Open paper trades.
- Closed paper trades.
- Win/loss distribution.
- P&L by setup type.
- P&L by regime.
- Performance by confidence bucket.
- Rule adherence versus override behavior.

### Automation visibility
- Is the system in signal-only, paper, assisted-live, or live-auto mode?
- Which setups are eligible for live trading?
- Which broker actions succeeded, failed, or remain pending?
- Did any risk guardrail block an order?
- Is the kill switch active?

The user should never have to guess what the system did.

## Recommended stack
Use the same low-cost stack initially:
- GitHub Actions for scheduled Python compute.
- Supabase for PostgreSQL storage, Realtime, and state persistence.
- Vercel for static frontend hosting.

This remains acceptable because the system is low-frequency, batch-driven, and single-user.

## Lean-but-real roadmap

## Stage 1 — Signal Engine and Dashboard
### Objective
Produce reliable signals and show them clearly.

### Deliverables
- Regime engine.
- Flows engine.
- Leadership engine.
- Risk state.
- Advisor layer.
- One aggregated `signals_summary` row per run.
- Dashboard cards for regime, flows, leaders, risk, freshness, and status.

### UI visibility requirements
The dashboard must show:
- current regime,
- current bias,
- top leaders and laggards,
- confidence and conflict flags,
- last run timestamp,
- data freshness badges,
- and change from previous run.

### Success criteria
- The user can understand the current system view in under two minutes.
- Signals are explainable.
- Signal outputs are not obviously noisy or contradictory.

### Stage gate
Proceed only if the signal view is trusted enough to monitor daily.

## Stage 2 — Tool-Generated Paper Trades
### Objective
Have the tool create paper trades from its own alerts and rules.

### Deliverables
- `paper_orders` table.
- `paper_trades` table.
- Promotion rules from recommendation to paper order.
- Rule-based entry sizing using existing risk logic.
- Entry and exit assumptions defined explicitly.
- Open and closed paper-trade screens.

### Promotion rules
A signal should create a paper order only if:
- regime is tradable,
- confidence is above threshold,
- setup is not conflicted beyond tolerance,
- risk state is not halted,
- and symbol passes liquidity or eligibility filters.

### UI visibility requirements
For every paper trade, the user must see:
- source signal,
- reason for entry,
- confidence at entry,
- stop and target references,
- sizing basis,
- status,
- and reason for rejection if not promoted.

### Success criteria
- The tool can create paper trades automatically from its own signals.
- The user can inspect every paper trade end-to-end.
- Paper-trade creation is deterministic and explainable.

### Stage gate
Proceed only if paper trade generation is stable and traceable.

## Stage 3 — Paper Performance and Signal Review
### Objective
Measure whether the system has real decision value.

### Deliverables
- Paper-trade history view.
- Performance by regime.
- Performance by setup type.
- Performance by confidence bucket.
- Performance by symbol and sector.
- Signal-to-paper-trade lineage view.
- Manual annotations for unusual cases.

### UI visibility requirements
The user must be able to answer:
- Which setup types work best?
- Which setup types fail repeatedly?
- Are high-confidence trades actually outperforming?
- Is the system better in trending or range-bound conditions?
- Are conflicts correctly reducing risk or just blocking good trades?

### Success criteria
- The user can evaluate signal quality from actual paper results.
- Performance is segmented, not hidden in a single aggregate number.
- The system can distinguish good setups from weak ones.

### Stage gate
Proceed only if the baseline shows credible value after realistic assumptions.

## Stage 4 — Broker-Readiness Hardening
### Objective
Prepare for live automation without pretending paper performance is enough by itself.

### Deliverables
- Broker adapter interface separated from signal logic.
- Order-state model.
- Broker acknowledgement tracking.
- Rejection and retry handling.
- Kill switch.
- Max daily loss guardrail.
- Duplicate-order protection.
- Mode selector: signal-only / paper / assisted-live / live-auto.

### UI visibility requirements
The user must see:
- current operating mode,
- broker connection state,
- order placement result,
- pending orders,
- rejected orders,
- kill-switch state,
- and any guardrail-triggered block.

### Success criteria
- Broker logic is isolated from strategy logic.
- The system can fail safely.
- Order failures are visible and recoverable.

### Stage gate
Proceed only if broker-readiness checks are passed and paper performance remains acceptable.

## Stage 5 — Constrained Live Automation
### Objective
Go live in a deliberately narrow way.

### Initial live constraints
- Small position size.
- Limited symbol universe.
- Limited setup types.
- One or two trade windows only.
- Risk guardrails always active.
- User can switch back to assisted-live or paper immediately.

### Assisted-live option
If desired, begin with assisted-live mode where the tool prepares trades and the user approves before broker execution.

### UI visibility requirements
The user must see, in one place:
- live eligible setups,
- submitted broker orders,
- execution state,
- live P&L,
- blocked trades,
- and any mismatch between signal intent and broker response.

### Success criteria
- The tool handles live trading for a narrow setup set without silent failures.
- Risk blocks work.
- Order and position state are visible.

### Stage gate
Expand only if constrained live trading stays operationally clean and analytically acceptable.

## Suggested minimum schema
### Core signal tables
- `signals_summary`
- `stock_scores`
- `pipeline_health`

### Paper-trading tables
- `paper_orders`
- `paper_trades`

### Review tables
- `journal_entries`
- `signal_outcomes`

### Live-trading tables for later stage
- `broker_orders`
- `broker_fills`
- `position_state`
- `execution_events`

## Paper-to-live decision criteria
Promotion from paper to live should require all of the following:
- stable signal behavior,
- acceptable paper-trade sample size,
- positive expectancy after fees and slippage assumptions,
- acceptable drawdown profile,
- no major unresolved signal-quality issue,
- and broker safeguards implemented.

Do not use “a few good weeks” alone as the automation criterion.

## What should still be deferred
Even with this more execution-oriented plan, still defer:
- broad ML dependence,
- SHAP and interpretability tooling for early-stage models,
- full portfolio accounting,
- multi-user collaboration,
- and broker-specific complexity before the adapter boundary exists.

## Build order
1. Build signal engine and dashboard.
2. Add tool-generated paper orders and paper trades.
3. Add performance review views.
4. Add broker-readiness controls.
5. Launch assisted-live or constrained live mode.
6. Expand only if results and operations justify it.

## Final recommendation
SteadyAlpha for a single-user trader should be treated as a signal-to-execution progression, not just a learning dashboard.

But the progression must remain disciplined:
- first prove signal quality,
- then automate paper trading,
- then harden broker operations,
- then go live narrowly,
- and only then widen automation scope.

That keeps the product practical without becoming reckless.
