# Phase 0: Foundation and Operating Model - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Source:** PRD Express Path (Signal Engine & Dashboard — Technical Specification.md)

<domain>
## Phase Boundary
This phase focuses on creating the minimum system skeleton. It includes setting up the repository structure, environment for GH Actions/Supabase/Vercel, and implementing basic run registration and health monitoring.

Deliverables:
- Repository structure (pipeline/, frontend/, supabase/, config/, tests/)
- GitHub Actions CI/CD and pipeline workflows
- Supabase tables: `run_registry`, `pipeline_health`
- Base frontend shell with health banner
- Initial config files

</domain>

<decisions>
## Implementation Decisions

### Repository Structure
- `pipeline/`: Core engine logic (feed.py, main.py, etc.)
- `frontend/`: Vercel-hosted UI
- `supabase/`: SQL migrations and setup
- `config/`: Centralized YAML/JSON settings
- `tests/`: Unit and integration tests

### Data Store (Supabase)
- **`run_registry` table:** Must include `trigger_type`, `status`, `code_version`, and `config_snapshot`.
- **`pipeline_health` table:** Track run-time health metrics.

### Automation (GitHub Actions)
- `CI` for tests
- `Deploy` for frontend/backend
- `Pipeline` for scheduled runs

### the agent's Discretion
- Choice of specific frontend framework (Next.js recommended).
- Specific structure of YAML config files.
- Exact styling of the health banner.

</decisions>

<canonical_refs>
## Canonical References

### Roadmap & Spec
- `steadyalpha-master-roadmap.md` — Stage 0 goals
- `Signal Engine & Dashboard — Technical Specification.md` — Technical stack and architecture

</canonical_refs>

<specifics>
## Specific Ideas
- Inject `CODE_VERSION` (git SHA) via GitHub Actions environment variables.
- Serialize all `config/` files into a JSON snapshot at the start of every run.

</specifics>

<deferred>
## Deferred Ideas
- Signal engines (Regime, Flows, etc.) are deferred to Stage 2.
- Data reliability layer is deferred to Stage 1.
- Paper simulation is deferred to Stage 4.

</deferred>

---
*Phase: 00-foundation-and-operating-model*
*Context gathered: 2026-04-25 via PRD Express Path*
