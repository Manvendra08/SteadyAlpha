# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SteadyAlpha** is a staged market-intelligence and trading simulation system designed for positional trading. The system emphasizes operational honesty, deterministic replay, and evidence-based evolution. Phase 0 (Foundation and Operating Model) is complete; Stage 1 (Data Reliability Layer) is active.

**Core Principles:** Reliability > Speed, Auditability > Elegance, Replayability > Simulation, Simulation > ML, Evidence > Automation.

## Architecture

```
SteadyAlpha
├── frontend/                  # Next.js console UI (React 18, TypeScript, Tailwind)
├── pipeline/                  # Python data processing engines
├── supabase/                  # PostgreSQL migrations and schema
├── config/                    # Runtime config (YAML/JSON) - loaded by pipeline
├── tests/                     # Test directory (currently empty)
└── .github/workflows/         # GitHub Actions - daily scheduled pipeline + manual dispatch
```

### Key Components

- **Frontend Console:** Next.js app displaying system health, pipeline status, and signal review. Components: HealthBanner (pipeline status indicator), Home (main dashboard).
- **Pipeline:** Python 3.12 scripts that run on schedule or on-demand. Workflow: load config snapshot → register run → execute engines → update status/health. Persists run metadata and health state to Supabase.
- **Storage:** Supabase (PostgreSQL) with tables for run_registry, pipeline_health, and signal data. Schema defined in supabase/migrations/.
- **CI/CD:** GitHub Actions workflow (pipeline.yml) executes at 10:00 UTC daily and on manual dispatch. Passes SUPABASE_URL and SUPABASE_SERVICE_KEY as secrets.

## Development Commands

### Frontend

```bash
cd frontend
npm install              # Install dependencies
npm run dev             # Start dev server (http://localhost:3000)
npm run build           # Production build
npm run start           # Start production server
npm lint                # Run ESLint
```

### Pipeline

```bash
# Local execution (requires SUPABASE_URL and SUPABASE_SERVICE_KEY in environment)
python pipeline/main.py

# Or via GitHub Actions (workflow_dispatch in Actions tab)
```

### Configuration

Runtime config files (YAML/JSON) go in `config/` and are automatically loaded by the pipeline and serialized as a config snapshot with each run. Example: `config/default.yaml`.

## Code Organization

- **frontend/app/page.tsx:** Home component - displays stage context and operational honesty message.
- **frontend/components/HealthBanner.tsx:** System health display - shows status, last success timestamp, and message. Currently mocked; will connect to Supabase health endpoint.
- **pipeline/main.py:** Entry point - loads config, registers run, executes engines (TODO), updates status and health.
- **pipeline/persist.py:** Database abstraction - register_run(), update_run_status(), update_health(). Currently mocked; TODO: integrate with Supabase client.

## Important Notes

- **Mocking:** persist.py functions are currently print-only (for foundation phase). Supabase client integration is pending.
- **No Tests Yet:** tests/ directory exists but is empty. New features should include tests.
- **Deterministic Replay:** Every pipeline run is tracked with run_id, trigger_type, code_version, and config_snapshot to enable historical reconstruction.
- **Health Tracking:** HealthBanner component should consume pipeline_health table, not mock data, once Supabase integration is complete.

## Environment Variables

Required for pipeline execution:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key

Optional:
- `CODE_VERSION` - Git commit SHA (set by GitHub Actions)
- `TRIGGER_TYPE` - 'scheduled' or 'manual' (set by GitHub Actions)
