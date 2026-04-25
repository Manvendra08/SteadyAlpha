---
wave: 1
depends_on: []
files_modified:
  - pipeline/validate.py
  - pipeline/sources.py
requirements_addressed:
  - REQ-101
autonomous: true
---

# Plan: Data Reliability Layer

## Objective
Establish a trustworthy data ingestion pipeline with source hierarchy and health validation.

## Tasks

<task>
<id>data-001</id>
<objective>Implement Source Hierarchy logic</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-CONTEXT.md
</read_first>
<action>
Create 'pipeline/sources.py' with:
- `SourceHierarchy` class to manage primary/secondary sources per dataset.
- `get_best_source(dataset_id)` method.
</action>
<acceptance_criteria>
- File 'pipeline/sources.py' exists.
- Logic correctly falls back to secondary if primary is marked unavailable.
</acceptance_criteria>
</task>

<task>
<id>data-002</id>
<objective>Implement Data Health Validation</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-RESEARCH.md
</read_first>
<action>
Create 'pipeline/validate.py' with:
- `validate_freshness(data, threshold_minutes)` function.
- `validate_sanity(data, rules_dict)` function (checks for nulls, out-of-range values).
- `DataHealth` Enum (FRESH, STALE, DEGRADED, MISSING).
</action>
<acceptance_criteria>
- File 'pipeline/validate.py' exists.
- `validate_freshness` correctly identifies stale data based on 'config/default.yaml' thresholds.
</acceptance_criteria>
</task>

## Verification
- Unit tests in 'tests/test_data_reliability.py' for fallback and health classification.
