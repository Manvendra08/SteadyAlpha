# SteadyAlpha — Roadmap (Single-User Trading Copilot)

## Milestone 1: Trusted Intelligence & Paper Trading
Goal: Build a reliable signal engine and validate it through automated paper trading.

### Phase 0: Foundation and Operating Model [COMPLETE]
- Repository structure and infrastructure setup.
- Run tracking and pipeline health.

### Phase 1: Data Reliability & Signal Engines
**Objective:** Make source data trustworthy and build the analytical core.
- Data Reliability: Source hierarchy and validation [REQ-101]
- Regime Engine: State assessment with hysteresis [REQ-102]
- Flows Engine: Institutional and Sector flows [REQ-103]
- Leadership Engine: RS-based ranking [REQ-104]
- Signals Summary: Aggregated row persistence [REQ-105]

### Phase 2: Signal Dashboard & Advisor [COMPLETE]
**Objective:** Create the operator console for signal review.
- UI Cards: Regime, Flows, Leadership, Risk [REQ-201]
- Advisor Layer: Weighted voting and reasoning [REQ-202]
- Change Tracking: "What changed since last run" visibility [REQ-203]

### Phase 3: Automated Paper Execution [COMPLETE]
**Objective:** Tool-generated paper trades from qualified signals.
- Paper Trade Tables: Orders and Trades [REQ-301]
- Promotion Rules: Recommendation to paper order [REQ-302]
- Execution Screens: Open/Closed paper trades [REQ-303]

### Phase 4: Performance Review & Broker Hardening [ACTIVE]
**Objective:** Segmented performance analysis and broker adapter isolation.
- [x] Performance Views: By regime, setup, and confidence [REQ-401]
- [ ] Broker Adapter: Isolated interface for execution [REQ-402]
- [ ] Risk Guardrails: Kill switch and daily loss limits [REQ-403]

### Phase 5: Constrained Live Automation
**Objective:** Earned live trading with strict constraints.
- Live Operating Modes: Assisted-live / Live-auto [REQ-501]
- Live Dashboard: Broker connection and execution state [REQ-502]

---
*Last updated: 2026-04-25 (Strategic Pivot to Trading Copilot)*
