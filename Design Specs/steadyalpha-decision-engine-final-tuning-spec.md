# SteadyAlpha Decision Engine Final Tuning Spec

## Purpose
This document defines the final tuning changes required for the SteadyAlpha decision engine so the decision output matches the evidence shown by the engines and avoids collapsing too many valid paper-mode setups into `NO_TRADE`.

The current implementation is structurally improved, but the final action layer still behaves too conservatively and contains semantic inconsistencies between engine validity, directional contribution, and final decision state.

## Current observed problem
A representative run shows:
- real and fresh core feeds,
- bullish regime,
- neutral but non-bearish flows,
- active risk state,
- paper mode enabled,
- but final decision still rendered as `NO_TRADE` with 16% directional and action confidence.

At the same time, pre-flight gates display all engines as `PASS`, which creates a contradiction between visible engine state and final action outcome.

## Final tuning goals
1. Separate engine validity from directional contribution.
2. Remove circular logic where leadership is suppressed because the final decision is `NO_TRADE`.
3. Ensure paper mode surfaces `WATCHLIST` or low-confidence bias states more often when regime and risk are supportive.
4. Make confidence values reflect actual opportunity quality rather than over-penalized neutrality.
5. Make the decision explainer semantically precise.

## Required changes

### 1. Split engine status into validity and vote
Current gate labels overload `PASS` to mean both “engine is usable” and “engine supports a trade.”

#### Required model
Each engine must expose two independent fields:
- `validity_status`: `VALID` | `DEGRADED` | `INVALID`
- `directional_vote`: `LONG` | `SHORT` | `NEUTRAL` | `WEAK` | `BLOCKED`

#### Example mapping
- Regime: `VALID`, vote `LONG`
- Flows: `VALID`, vote `NEUTRAL`
- Leadership: `DEGRADED`, vote `WEAK`
- Risk: `VALID`, vote `PASS_EXECUTION`

#### UI change
Replace the current `Pre-Flight Gates` block with either:
- `Engine Validity`, or
- `Execution Preconditions`

Then show directional votes separately in the Decision Trace.

## 2. Stop suppressing leadership because final state is no-trade
Current behavior appears circular: leadership is suppressed because the system is already in `NO_TRADE`, while the system also remains in `NO_TRADE` partly because leadership contributes nothing.

#### Required rule
Leadership must always compute independently before final decision mapping.

#### Allowed final outputs
- `STRONG`
- `WEAK`
- `NEUTRAL`
- `BLOCKED`

#### Disallowed behavior
- `suppressed due to no-trade state`

#### Replace with
- `0 qualifying leaders found`
- `coverage below confidence threshold`
- `leadership weak`
- `leadership unavailable`

## 3. Add minimum watchlist rule for valid directional setups
The system needs an intermediate action state for setups that are directionally plausible but not strong enough for promotion.

#### Required rule
If all are true:
- run validity is `YES`,
- regime vote is `LONG` or `SHORT`,
- risk validity is `VALID`,
- risk gate allows execution,
- flows are not contradictory,

then the action should not collapse to `NO_TRADE` unless leadership is explicitly contradictory or missing below a hard minimum threshold.

#### Mapping
- bullish regime + neutral flows + weak leadership + active risk => `WATCHLIST_LONG`
- bearish regime + neutral flows + weak leadership + active risk => `WATCHLIST_SHORT`

## 4. Introduce hard distinction between neutral and contradictory
Neutral evidence must not be treated like a failed trade condition.

#### Required rule
Per engine contribution:
- `supportive` => positive contribution
- `neutral` => zero contribution
- `contradictory` => negative contribution

#### Examples
- neutral flow should reduce confidence only by lack of boost, not by active penalty
- unknown sector alignment should not count as bearish
- absence of strong leaders should be weak or neutral, not equivalent to contradiction

## 5. Recalibrate confidence floors in paper mode
The current directional and action confidence are still too low for valid directional runs.

#### Required rule
In `PAPER` mode, apply a minimum directional confidence floor when:
- run validity = `YES`
- regime is directional
- risk is active
- no critical contradictions exist

#### Proposed floor
```ts
if (
  mode === 'PAPER' &&
  runValidForTrading === 'YES' &&
  regimeVote !== 'NEUTRAL' &&
  riskGate === 'PASS' &&
  !hasCriticalContradiction
) {
  directionalConfidence = Math.max(directionalConfidence, 0.22)
}
```

#### Reason
A valid directional paper setup should not routinely display 10–16% confidence unless the evidence is truly poor.

## 6. Separate confidence math from final action mapping
#### Required fields
Persist and display:
- `directional_confidence`
- `action_confidence`
- `promotion_threshold`
- `watchlist_threshold`
- `blocking_reason`

#### Rule
A run may have:
- sufficient directional confidence for `WATCHLIST_LONG`
- but insufficient action confidence for `PAPER_ELIGIBLE`

This distinction must remain visible.

## 7. Add leadership floor for paper-mode watchlist generation
Leadership should not be required to be strong in order to generate a watchlist state.

#### Required rule
Use a lower threshold for paper watchlist states than for promotion.

#### Proposed thresholds
```ts
const leadershipThresholds = {
  watchlist: 0.05,
  paperEligible: 0.18,
  strongPaperEligible: 0.30,
}
```

#### Interpretation
- below `0.05` => neutral/weak
- at or above `0.05` => can support watchlist
- at or above `0.18` => can support paper promotion when other engines align

## 8. Rework final action mapping
Use operational states that reflect the evidence shown by the engines.

#### Proposed mapping
```ts
if (!runValidForTrading) return 'INVALID_FOR_TRADING'
if (riskGate !== 'PASS') return 'NO_TRADE'

if (directionalVote === 'LONG') {
  if (actionConfidence >= 0.55) return 'PAPER_ELIGIBLE'
  if (actionConfidence >= 0.38) return 'LONG_BIAS_LOW_CONF'
  if (directionalConfidence >= 0.20) return 'WATCHLIST_LONG'
  return 'NO_TRADE'
}

if (directionalVote === 'SHORT') {
  if (actionConfidence >= 0.55) return 'PAPER_ELIGIBLE'
  if (actionConfidence >= 0.38) return 'SHORT_BIAS_LOW_CONF'
  if (directionalConfidence >= 0.20) return 'WATCHLIST_SHORT'
  return 'NO_TRADE'
}

return 'NO_TRADE'
```

## 9. Tighten decision explainer semantics
The decision explainer layout is good, but the labels need stricter logic.

#### Required sections
- `Direction Drivers`
- `Confidence Boosters`
- `Confidence Drags`
- `Execution Gates`
- `Promotion Outcome`

#### Required output rule
If the final action is `NO_TRADE`, the page must say exactly why:
- insufficient directional score
- insufficient leadership support
- contradictory flow input
- risk block
- promotion threshold not met

Do not leave the user to infer why all visible “passes” still led to `NO_TRADE`.

## 10. Make flow semantics non-blocking unless explicitly bearish
#### Required rule
Flows should be mapped as:
- `LONG`
- `SHORT`
- `NEUTRAL`
- `CONTRADICTORY`

#### Rule
Only `SHORT` or `CONTRADICTORY` should drag a bullish setup materially.

`NEUTRAL` should contribute 0, not behave like a weak fail.

## 11. Add decision trace fields
Persist these additional fields in the decision trace row/model:
- `engine_validity`
- `engine_vote`
- `engine_contribution`
- `is_blocking`
- `block_reason`
- `used_for_direction`
- `used_for_promotion`

This makes the final outcome auditable.

## 12. UI refinements
### Replace labels
- `PASS` in pre-flight engine boxes -> `VALID`
- `SUPPRESSED` in leadership card when final action is no-trade -> use evaluated state such as `WEAK` or `NO_QUALIFIERS`

### Add top-line summary sentence
Example:
- `Directional setup exists, but not enough confirmation for paper promotion.`
- `Bullish regime detected; watchlist only because leadership is weak and flows are neutral.`

This should appear above or below the Master Decision Engine block.

## 13. Suggested copy for the exact current pattern
For a run with bullish regime, neutral flows, weak leadership, active risk, and valid data:

### Recommended final state
- `WATCHLIST_LONG`

### Recommended explainer
- `Directional setup detected from regime.`
- `Flows are neutral and do not confirm.`
- `Leadership is weak with no qualifying leaders.`
- `Risk is active, but promotion threshold not met.`

That is far more honest than `NO_TRADE` with all engines visually passing.

## Backend changes required
- compute and persist validity status separately from directional vote
- compute and persist leadership state before final action mapping
- persist watchlist floor application flag
- persist action mapping reason
- persist minimum-confidence floor usage
- persist whether a signal failed because of score or gate

## Acceptance criteria
This tuning is complete only when:
- no-valid-but-neutral setup is mislabeled as hard `NO_TRADE` when it should be watchlist-grade
- pre-flight labels no longer imply directional endorsement
- leadership is never circularly suppressed by final decision state
- neutral flow inputs are non-blocking by default
- paper mode produces more `WATCHLIST_*` and `*_LOW_CONF` states in directional markets
- decision explanations clearly state why promotion did or did not occur

## Rollout plan
1. rename and split pre-flight validity vs directional vote
2. remove circular leadership suppression
3. add watchlist floor logic
4. update final action mapping
5. replay last 20–40 runs and compare old vs new decision labels
6. verify signal volume does not spike excessively
7. tune paper thresholds if still too sterile

## Final recommendation
Do not keep tightening the same decision engine with new edge-case rules.

Fix the semantics first, then let valid directional setups survive as watchlist or low-confidence paper states instead of collapsing into `NO_TRADE`.
