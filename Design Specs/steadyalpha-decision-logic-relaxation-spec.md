# SteadyAlpha Decision Logic Relaxation Spec

## Purpose
This document defines the changes required to make SteadyAlpha generate more usable trade candidates in real market conditions without turning the system into a noisy signal machine.

The current behavior is too restrictive for paper trading and early production validation. The system is receiving real data, showing strong trading readiness, and still producing too many `NO_TRADE` outcomes because the decision layer is over-penalizing neutral or mildly mixed signals.

## Problem statement
The current run shows:
- all critical feeds are real and trading-valid,
- trading readiness is high,
- regime is bullish,
- leadership is ready,
- risk is ready,
- but the final decision is still `NO_TRADE` with only 23% model confidence.

This indicates the decision layer is acting like a consensus gate rather than a practical weighted decision engine.

## Core diagnosis
The issue is probably not the market-data layer anymore.

The issue is the decision aggregation layer:
- neutral flow input is likely suppressing directional setups too much,
- leadership contribution appears too weak or too compressed,
- confidence calibration is likely too conservative,
- and paper-mode thresholds are too close to live-trading thresholds.

## Design goal
Change the system from:
- `trade only when almost everything aligns strongly`

to:
- `surface more opportunities in paper mode when regime and leadership are directionally supportive, while still blocking obviously weak or risky setups`

## Guiding principles
1. Neutral signals should usually reduce confidence, not veto the trade.
2. Regime and leadership should carry more weight than currently observed in the final action layer.
3. Paper mode should be more permissive than live mode.
4. `WATCHLIST` should be used more often as an intermediate state.
5. Risk should gate execution and sizing, not dominate directional confidence.

## Required changes

### 1. Separate action thresholds by mode
Use different thresholds for:
- `WATCHLIST`
- `PAPER_ELIGIBLE`
- `LIVE_ELIGIBLE`

### Proposed thresholds
```ts
const decisionThresholds = {
  paper: {
    watchlist: 0.20,
    paperEligible: 0.38,
    strongPaperEligible: 0.55,
  },
  assistedLive: {
    watchlist: 0.28,
    liveEligible: 0.50,
    strongLiveEligible: 0.65,
  },
  liveAuto: {
    watchlist: 0.35,
    liveEligible: 0.60,
    strongLiveEligible: 0.72,
  }
}
```

### Rule
A score that is too weak for live mode may still be useful in paper mode.

## 2. Stop treating neutral flows as near-failure
### Problem
When regime is bullish and flows are neutral, the current system appears to collapse toward `NO_TRADE` too aggressively.

### Required change
Treat neutral flows as `0` contribution, not as effective veto.

### Rule
- bullish flow = positive modifier
- bearish flow = negative modifier
- neutral flow = no boost, no veto

### Impact
This allows regime + leadership setups to survive when options/cash-flow inputs are merely mixed rather than actively bearish.

## 3. Raise regime importance in directional setup discovery
### Problem
The current engine can show bullish regime and still fail to create even a `WATCHLIST` quality directional state.

### Required change
Use regime as the primary directional anchor.

### Proposed regime scoring
```ts
const regimeWeights = {
  strongBullish: 0.35,
  bullish: 0.28,
  transition: 0.10,
  range: 0.00,
  bearish: -0.28,
  strongBearish: -0.35,
}
```

### Rule
If regime is bullish and risk is active, the base state should be at least directional-watchlist unless leadership is explicitly weak.

## 4. Make leadership actually matter
### Problem
Leadership is ready, but its displayed contribution appears weak despite broad universe coverage.

### Required change
Leadership must contribute both:
- directional support,
- and trade-candidate quality.

### Proposed leadership score structure
```ts
leadershipSignal = (
  0.45 * leaderBreadthScore +
  0.35 * avgCompositeScore +
  0.20 * volumeConfirmationScore
)
```

### Additional rule
If leadership engine is `READY` and top decile leaders exist, it should contribute positively even if flows are neutral.

### Validation requirement
Investigate why `Avg Score` is near zero despite 100+ symbols in universe. This may indicate over-normalization or score compression.

## 5. Introduce directional bias states before hard action states
### Required new intermediate states
- `LONG_BIAS_LOW_CONF`
- `SHORT_BIAS_LOW_CONF`
- `WATCHLIST_LONG`
- `WATCHLIST_SHORT`

### Reason
The current jump from analytical state directly to `NO_TRADE` is too coarse.

### Example mapping
- bullish regime + neutral flow + decent leadership + active risk -> `WATCHLIST_LONG`
- bullish regime + supportive leadership + neutral flow + paper mode -> `LONG_BIAS_LOW_CONF`
- strong multi-engine alignment -> `PAPER_ELIGIBLE`

## 6. Add permissive paper-mode rule set
### Rule
In `PAPER` mode, allow paper candidates when:
- regime is directional,
- leadership is not weak,
- risk is active,
- and no critical engine is invalid.

### Proposed paper-mode promotion rules
```ts
if (
  mode === 'PAPER' &&
  runValidForTrading &&
  regimeDirectional &&
  leadershipScore >= 0.15 &&
  riskGate === 'PASS' &&
  finalScore >= 0.38
) {
  action = 'PAPER_ELIGIBLE'
}
```

### Note
This is still selective. It is just less sterile.

## 7. Use flows as confidence modifier, not dominant blocker
### Proposed weighting shift
Current documented advisor shell weights are roughly:
- regime 0.30
- flow bias 0.20
- leadership 0.30
- PCR OI 0.20

Revise toward:
- regime 0.35
- leadership 0.30
- flows 0.20
- PCR/max-pain 0.10
- risk direction contribution 0.05 max as execution-context modifier

### Reason
PCR and flow context should refine conviction, not repeatedly suppress otherwise valid directional setups.

## 8. Split confidence into two layers
### Required change
Compute:
- `directionalConfidence`
- `actionConfidence`

### Meaning
- `directionalConfidence` = how strongly the model sees directional bias
- `actionConfidence` = whether the setup should actually be promoted given risk + data + alignment

### Example
A run may have:
- directional confidence: 0.48
- action confidence: 0.34

That could still justify `WATCHLIST_LONG` even if not `PAPER_ELIGIBLE`.

## 9. Add score floors for obvious directional setups
### Rule
If all are true:
- regime bullish or bearish,
- breadth confirms,
- leadership engine ready,
- risk active,
- no critical invalidity,

then final directional score should not collapse below a minimum watchlist floor.

### Proposed floor
```ts
if (regimeDirectional && breadthConfirmed && leadershipReady && riskActive) {
  finalScore = Math.max(finalScore, 0.22)
}
```

### Reason
This prevents the decision layer from numerically crushing otherwise legitimate opportunities.

## 10. Penalize only explicit contradiction
### Problem
The current setup seems to punish absence of confirmation almost like contradiction.

### Required change
Use three states for each engine:
- supportive
- neutral
- contradictory

### Rule
- supportive => positive weight
- neutral => zero weight
- contradictory => negative weight

Do not treat neutral as soft-fail.

## 11. Add decision explainer buckets
### Required reasons block
For each final decision, explain in this structure:
- `Direction Drivers`
- `Confidence Boosters`
- `Confidence Drags`
- `Execution Gates`

### Example
```text
Direction Drivers:
- Regime bullish
- Breadth supportive

Confidence Drags:
- Flow neutral
- PCR inconclusive

Execution Gates:
- Risk active
- Paper promotion allowed
```

This will make it obvious whether the system is too restrictive or the market is genuinely inconclusive.

## 12. Add paper-signal volume monitoring
### Purpose
Avoid overcorrecting into too many signals.

### Required metric
Track per week:
- total watchlist signals
- total paper-eligible signals
- total live-eligible signals
- conversion from watchlist to paper
- win rate by confidence bucket

### Rule
The goal is not “more signals” blindly. The goal is “enough quality signals to evaluate the system.”

## Proposed scoring model
```ts
finalDirectionalScore =
  0.35 * regimeScore +
  0.30 * leadershipScore +
  0.20 * flowScore +
  0.10 * pcrScore +
  0.05 * executionContextScore
```

### Mapping
```ts
if (!runValidForTrading) return 'INVALID_FOR_TRADING'
if (riskGate !== 'PASS') return 'NO_TRADE'

if (mode === 'PAPER') {
  if (finalDirectionalScore >= 0.55) return 'PAPER_ELIGIBLE'
  if (finalDirectionalScore >= 0.38) return 'LONG_BIAS_LOW_CONF'
  if (finalDirectionalScore >= 0.20) return 'WATCHLIST_LONG'
  return 'NO_TRADE'
}
```

Mirror for short-side setup states.

## UI changes required
### Decision panel
Replace a single generic confidence number with:
- `Directional Confidence`
- `Action Confidence`

### Add state labels
Allow:
- `WATCHLIST_LONG`
- `WATCHLIST_SHORT`
- `LONG_BIAS_LOW_CONF`
- `SHORT_BIAS_LOW_CONF`
- `PAPER_ELIGIBLE`
- `NO_TRADE`
- `INVALID_FOR_TRADING`

### Add decision diagnostics
Show whether the setup failed because of:
- lack of direction,
- lack of confirmation,
- risk block,
- or action threshold not met.

## Backend changes required
- persist intermediate engine contribution values
- persist neutral vs contradictory classification per engine
- persist directionalConfidence and actionConfidence separately
- persist final score floor application flag
- persist decision reason buckets

## Acceptance criteria
This change is successful only when:
- the system produces more `WATCHLIST` and low-confidence paper candidates in directional markets,
- neutral flow inputs do not repeatedly collapse otherwise valid setups,
- paper mode is clearly more permissive than live mode,
- signal count increases moderately without exploding into noise,
- and the decision trace clearly explains why a trade was or was not promoted.

## Recommended rollout
1. implement scoring separation and neutral-vs-contradictory logic
2. lower paper thresholds only
3. backtest / replay last 20–40 runs
4. compare signal count, paper promotions, and false-positive rate
5. only then adjust live-mode thresholds

## Final recommendation
Do not loosen everything at once.

The right move is to make paper mode more permissive, treat neutral as neutral, and let regime + leadership create directional opportunity states more often.

That will make the system testable without making it reckless.
