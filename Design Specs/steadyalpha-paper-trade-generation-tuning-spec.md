# SteadyAlpha Paper Trade Generation Tuning Spec

## Purpose
This document defines the next tuning pass required to make SteadyAlpha generate paper trades and candidate setups in active markets.

The current system is no longer blocked by data validity or UI semantics. The bottleneck has shifted to candidate generation, leadership qualification, and paper-promotion thresholds.

## Problem statement
Current observed pattern:
- regime is directional and valid,
- risk is active and valid,
- data is real and trading-valid,
- but paper trades still do not get generated,
- because flows is neutral and leadership produces zero qualifying leaders.

This means the engine is still too restrictive where it matters most: candidate creation and promotion.

## Core diagnosis
There are three likely blockers:
1. leadership qualification thresholds are too tight,
2. neutral flows are still behaving like a blocker,
3. paper promotion is too dependent on strong multi-engine agreement.

## Design goal
Move from:
- `only promote trades when high-confidence multi-engine alignment exists`

to:
- `generate ranked paper candidates in valid directional markets, then promote selectively based on score and risk`

## Key design change
Split paper trading into two distinct layers:
1. `Candidate Generation`
2. `Paper Promotion`

The current system appears to merge them too tightly.

## 1. Candidate Generation layer
### Purpose
Generate possible trade candidates whenever market structure is supportive, even if final promotion confidence is not yet strong.

### Candidate generation eligibility
Generate candidates when all are true:
- run validity = `YES`
- regime vote = `LONG` or `SHORT`
- risk gate = `PASS_EXECUTION`
- leadership engine has sufficient universe coverage
- no critical contradiction exists

### Important rule
Flows may be neutral and still allow candidate generation.

### Candidate generation outputs
Persist a ranked candidate list with:
- symbol
- direction
- candidate score
- leadership score
- regime alignment
- flow modifier
- risk status
- promotion eligible: yes/no
- promotion reason

## 2. Paper Promotion layer
### Purpose
Promote only the strongest candidates into paper trades.

### Promotion requirements
A candidate may be promoted only when:
- risk gate = `PASS_EXECUTION`
- symbol passes liquidity and turnover rules
- candidate score >= promotion threshold
- no explicit contradictory flow or regime condition exists
- run validity remains `YES`

### Important rule
Promotion thresholds must be higher than candidate-generation thresholds.

## 3. Leadership engine tuning
### Problem
Leadership frequently returns zero leaders even in active markets.

### Required investigation areas
Review and tune:
- quintile threshold
- volume ratio threshold
- 20-day turnover minimum
- score normalization/clipping
- leader count requirement
- earnings blackout strictness
- delivery score inclusion

### Likely issue
The current A-grade filter is probably too strict for paper-mode discovery.

### Required new thresholds
Use separate thresholds for:
- `candidate_quality_threshold`
- `paper_promotion_threshold`

### Proposed thresholds
```ts
const leadershipThresholds = {
  coverageMinForCandidateGeneration: 0.45,
  coverageMinForPromotion: 0.60,
  candidateScoreMin: 0.05,
  promotionScoreMin: 0.18,
  strongPromotionScoreMin: 0.30,
  volumeRatioMinCandidate: 1.00,
  volumeRatioMinPromotion: 1.15,
  turnoverMinCandidateCr: 2,
  turnoverMinPromotionCr: 5,
}
```

### Rule
A symbol can be a valid paper candidate without being top-tier institutional-quality.

## 4. Leadership state model
### Required outputs
Leadership must expose:
- `coverage_pct`
- `coverage_threshold_candidate`
- `coverage_threshold_promotion`
- `qualifying_candidates_count`
- `qualifying_promotion_count`
- `top_candidates`
- `top_promotable_candidates`

### Required UI behavior
Do not only show `0 leaders found`.
Show:
- `Candidates found`
- `Promotion-qualified leaders found`

Example:
- `Candidates: 4`
- `Promotion-qualified: 0`

That distinction is critical.

## 5. Stop using neutral flow as practical veto
### Required rule
Flow states must map like this:
- `LONG` => positive modifier
- `SHORT` => negative modifier
- `NEUTRAL` => zero modifier
- `CONTRADICTORY` => blocking or heavy negative modifier

### Disallowed behavior
- neutral flow collapsing otherwise valid candidate generation
- neutral flow preventing watchlist candidates when regime is directional

## 6. Candidate score formula
### Purpose
Generate a rankable candidate score before final promotion.

### Proposed formula
```ts
candidateScore =
  0.40 * leadershipSymbolScore +
  0.25 * regimeAlignmentScore +
  0.15 * volumeConfirmationScore +
  0.10 * flowModifierScore +
  0.10 * executionContextScore
```

### Notes
- leadership drives symbol selection
- regime drives directional bias
- flow modifies confidence, not basic eligibility unless contradictory
- execution context includes risk-active state and data validity

## 7. Promotion score formula
### Purpose
Promotion score should be stricter than candidate score.

### Proposed formula
```ts
promotionScore =
  0.35 * candidateScore +
  0.20 * liquidityQualityScore +
  0.15 * riskSizingFit +
  0.15 * leadershipConfidence +
  0.15 * flowConfirmation
```

### Rule
A symbol may appear in candidate list but still fail promotion.
That is healthy behavior.

## 8. New paper-mode states
### Required states
Add these pipeline states:
- `NO_CANDIDATES`
- `CANDIDATES_FOUND`
- `PROMOTION_BLOCKED`
- `PAPER_TRADES_CREATED`

### Meaning
- `NO_CANDIDATES`: no acceptable symbols from leadership
- `CANDIDATES_FOUND`: ranked list exists but nothing crossed promotion threshold
- `PROMOTION_BLOCKED`: candidate existed but blocked by risk/contradiction
- `PAPER_TRADES_CREATED`: one or more trades promoted

These states are better than a generic “no paper actions.”

## 9. Paper actions empty-state logic
### Required messages
Use cause-aware states:
- `No paper trades — no leadership candidates generated`
- `No paper trades — candidates found, but promotion threshold not met`
- `No paper trades — risk gate blocked promotion`
- `No paper trades — contradictory flow blocked directional setup`

## 10. Decision engine integration
### Required change
Decision engine must stop mapping directly from engine consensus to paper promotion.

Instead:
1. decision engine emits directional state
2. leadership engine emits candidate list
3. promotion engine decides whether any candidate becomes a paper trade

### Required output separation
Persist separately:
- `final_directional_state`
- `candidate_generation_state`
- `paper_promotion_state`

## 11. Supabase/data model additions
### Recommended fields
Add to run summary or dedicated tables:
- `candidate_count`
- `promotion_qualified_count`
- `top_candidate_symbol`
- `top_candidate_score`
- `promotion_block_reason`
- `paper_generation_state`

### Recommended new table
```sql
CREATE TABLE paper_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_ts TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  candidate_score FLOAT,
  promotion_score FLOAT,
  leadership_score FLOAT,
  flow_modifier FLOAT,
  risk_state TEXT,
  candidate_status TEXT,   -- generated | promoted | blocked
  block_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 12. UI changes
### Decision page
Add:
- `Candidates Found`
- `Promotion-Qualified`
- `Top Candidate`

### Leadership card
Replace simple leader count with:
- `Candidates`
- `Promotable`
- `Coverage`
- `Avg candidate score`

### Paper actions panel
If no trades created, show whether:
- there were no candidates,
- candidates existed but were blocked,
- or candidates existed but were below promotion threshold.

## 13. Diagnostics additions
### Required debug fields
Persist and expose:
- leadership coverage
- number of candidate-eligible symbols
- number of promotion-eligible symbols
- top 5 candidate scores
- lowest blocking threshold hit
- whether neutral flow reduced promotion only

## 14. Replay and calibration plan
### Required analysis
Run replay on last 20–50 sessions and capture:
- runs with directional regime
- runs with at least one candidate
- runs with at least one promoted paper trade
- candidate-to-promotion conversion rate
- paper trade frequency by market regime

### Success criteria
You do not want dozens of junk trades.
You want enough paper trades to evaluate system quality.

### Target starting range
For active market periods, aim for:
- candidates on 30–60% of directional runs
- paper promotions on 10–25% of directional runs

These are starting targets, not final truths.

## 15. Scenario expectations
### Scenario A
Bullish regime, neutral flows, weak but nonzero leadership candidates, active risk
Expected:
- `CANDIDATES_FOUND`
- maybe no promotion
- `WATCHLIST_LONG`

### Scenario B
Bullish regime, neutral flows, 2 solid leadership candidates, active risk
Expected:
- `CANDIDATES_FOUND`
- one or more `PAPER_TRADES_CREATED` if promotion score clears threshold

### Scenario C
Bullish regime, contradictory flows, weak leadership
Expected:
- `PROMOTION_BLOCKED` or `NO_CANDIDATES`

### Scenario D
Bearish regime, strong laggards, active risk
Expected:
- short-side candidates generated
- promotion depends on score and risk policy

## 16. Acceptance criteria
This tuning pass is complete only when:
- the system can generate candidates in valid directional markets,
- neutral flows do not veto candidate generation,
- leadership no longer collapses to zero in active markets without explanation,
- paper trades are promoted selectively from candidate list,
- empty states explain whether the failure was candidate generation or promotion,
- and replay analysis confirms nonzero paper-trade frequency without signal explosion.

## 17. Implementation order
1. Add candidate-generation layer.
2. Add candidate vs promotion thresholds.
3. Loosen leadership thresholds for candidate discovery.
4. Persist paper candidate rows.
5. Update UI for candidate counts and promotion state.
6. Replay 20–50 runs.
7. Tune thresholds based on evidence.

## Final recommendation
Do not keep solving this at the final decision label layer.

The real missing piece now is a ranked candidate-generation pipeline. Until that exists, the tool will continue to feel sterile even when market movement is real.
