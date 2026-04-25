---
wave: 1
depends_on: []
files_modified:
  - frontend/app/page.tsx
  - frontend/components/RegimeCard.tsx
  - frontend/components/FlowsCard.tsx
  - frontend/components/LeadershipCard.tsx
  - frontend/components/RiskCard.tsx
  - frontend/components/AdvisorCard.tsx
  - frontend/components/ChangeTracker.tsx
requirements_addressed:
  - REQ-201
  - REQ-202
  - REQ-203
autonomous: true
---

# Plan: Signal Dashboard & Advisor UI

## Objective
Build the full operator console with signal cards, advisor synthesis, and change tracking.

## Tasks

<task>
<id>dash-001</id>
<objective>Create signal card components</objective>
<action>
Create RegimeCard, FlowsCard, LeadershipCard, RiskCard components.
Each renders data from signals_summary mock.
</action>
<acceptance_criteria>
- All 4 card components exist
- Each displays relevant signal data
</acceptance_criteria>
</task>

<task>
<id>dash-002</id>
<objective>Create Advisor component</objective>
<action>
Create AdvisorCard that synthesizes engine outputs into action recommendation with confidence.
</action>
<acceptance_criteria>
- AdvisorCard displays recommendation (LONG/SHORT/NO_TRADE)
- Shows confidence score and reasoning
</acceptance_criteria>
</task>

<task>
<id>dash-003</id>
<objective>Create Change Tracker component</objective>
<action>
Create ChangeTracker that highlights what changed since previous run.
</action>
<acceptance_criteria>
- Component shows delta between current and previous signals
</acceptance_criteria>
</task>

<task>
<id>dash-004</id>
<objective>Assemble dashboard page</objective>
<action>
Update page.tsx to render all cards in a grid layout.
</action>
<acceptance_criteria>
- Dashboard renders all 6 cards + change tracker
</acceptance_criteria>
</task>
