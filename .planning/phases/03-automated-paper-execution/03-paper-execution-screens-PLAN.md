---
wave: 3
depends_on:
  - 01-paper-lifecycle-schema-PLAN.md
  - 02-promotion-engine-PLAN.md
files_modified:
  - frontend/app/page.tsx
  - frontend/components/PaperOrdersTable.tsx
  - frontend/components/OpenPaperTradesTable.tsx
  - frontend/components/ClosedPaperTradesTable.tsx
requirements_addressed:
  - REQ-303
autonomous: true
---

# Plan: Open and Closed Paper Execution Screens

## Objective
Provide operator UI views to inspect all paper orders and trades with full source-signal and sizing explainability.

## Tasks

<task>
<id>ui-301</id>
<objective>Create paper orders inspection table</objective>
<read_first>
- frontend/app/page.tsx
</read_first>
<action>
Create `frontend/components/PaperOrdersTable.tsx` showing:
- symbol, direction, status,
- source signal reference,
- confidence at entry,
- sizing basis,
- rejection reason when not promoted.
</action>
<acceptance_criteria>
- Rejected orders clearly display rejection reason.
- Accepted orders display sizing and source lineage fields.
</acceptance_criteria>
</task>

<task>
<id>ui-302</id>
<objective>Create open and closed trade tables</objective>
<read_first>
- frontend/app/page.tsx
</read_first>
<action>
Create:
- `frontend/components/OpenPaperTradesTable.tsx`
- `frontend/components/ClosedPaperTradesTable.tsx`
Include entry and exit fields, pnl, timestamps, and simulation assumptions.
</action>
<acceptance_criteria>
- Open trades view omits exit-only fields.
- Closed trades view includes exit reason and pnl.
</acceptance_criteria>
</task>

<task>
<id>ui-303</id>
<objective>Integrate execution views in dashboard page</objective>
<read_first>
- frontend/app/page.tsx
</read_first>
<action>
Update `frontend/app/page.tsx` to render:
- paper order table,
- open paper trades section,
- closed paper trades section,
below existing signal and advisor cards.
</action>
<acceptance_criteria>
- Page presents end-to-end inspection path from signal to paper outcome.
- Existing signal dashboard sections remain functional.
</acceptance_criteria>
</task>

## Verification
- Manual UI walkthrough confirms each paper row exposes source signal and sizing basis.
- Rejected and promoted scenarios are both visible without hidden state.

