# Paper Trade Generation Implementation Guide
## SteadyAlpha Paper Trade Generation Tuning Spec v0.7.1

### Overview
This document describes the implementation of the Paper Trade Generation Tuning Spec, which adds a two-layer candidate-to-promotion pipeline to SteadyAlpha's paper trading system.

**Goal:** Generate ranked paper candidates in valid directional markets, then promote selectively based on score and risk.

### Architecture Changes

#### 1. Two-Layer Pipeline

**Layer 1: Candidate Generation**
- Generates possible trade candidates whenever market structure is supportive
- Lower quality thresholds for discovery mode
- Emits: candidate list, candidate scores, generation state

**Layer 2: Paper Promotion**
- Promotes only the strongest candidates into paper trades
- Higher quality thresholds for execution mode
- Emits: promotable candidates, promotion scores, state

#### 2. New Files

##### `pipeline/engines/candidates.py`
Orchestrates candidate generation and scoring. Key methods:
- `calculate_candidate_scores()` - Implements Spec Formula 6
- `calculate_promotion_scores()` - Implements Spec Formula 7
- `run()` - Main orchestration; returns candidate generation state

##### `supabase/migrations/paper_candidates_v0_7_1.sql`
Creates `paper_candidates` table with:
- Candidate metrics (scores, components, flags)
- Promotion eligibility tracking
- Candidate status (generated | promoted | blocked)

##### `supabase/migrations/run_registry_extend_v0_7_1.sql`
Extends `runs` table with:
- Paper generation state
- Candidate and promotion counts
- Top candidate tracking
- Block reason diagnostics

#### 3. Modified Files

##### `config/default.yaml`
Added new sections:
- `leadership`: Candidate/promotion thresholds (coverage, scores, turnover)
- `candidate_scoring`: Formula weights for candidate and promotion scores
- `paper_execution.states`: New pipeline states
- `paper_execution.messages`: Cause-aware empty-state messages

##### `pipeline/engines/leadership.py`
Extended to output:
- Separate candidate and promotion lists
- Candidate generation coverage metrics
- Paper generation state (NO_CANDIDATES | CANDIDATES_FOUND | CANDIDATES_FOUND_PROMOTION_QUALIFIED)
- Top candidates and top promotable candidates

##### `pipeline/engines/advisor.py`
Now:
- Calls CandidatesEngine to generate candidates
- Emits candidate counts and generation state
- Outputs promotion-qualified symbol recommendations
- No longer blocks candidate generation based on neutral flows

##### `pipeline/persist.py`
Added:
- `insert_paper_candidates()` method
- Integration into `persist_full_run()` to persist candidate list

##### `pipeline/main.py`
Updated:
- Passes `run_validity` to Advisor for execution context scoring
- Includes candidate state in results for persistence

### Configuration

#### Leadership Thresholds (Section 3)
```yaml
leadership:
  # Candidate generation (discovery mode, loose)
  coverage_min_for_candidate_generation: 0.45
  candidate_score_min: 0.05
  volume_ratio_min_candidate: 1.00
  turnover_min_candidate_cr: 2
  
  # Paper promotion (execution mode, strict)
  coverage_min_for_promotion: 0.60
  promotion_score_min: 0.18
  strong_promotion_score_min: 0.30
  volume_ratio_min_promotion: 1.15
  turnover_min_promotion_cr: 5
```

#### Scoring Weights (Section 6-7)

**Candidate Score Formula (Section 6):**
```
candidateScore =
  0.40 * leadershipSymbolScore +
  0.25 * regimeAlignmentScore +
  0.15 * volumeConfirmationScore +
  0.10 * flowModifierScore +
  0.10 * executionContextScore
```

**Promotion Score Formula (Section 7):**
```
promotionScore =
  0.35 * candidateScore +
  0.20 * liquidityQualityScore +
  0.15 * riskSizingFit +
  0.15 * leadershipConfidence +
  0.15 * flowConfirmation
```

### Data Flow

#### Candidate Generation (Section 1)
1. Leadership engine generates candidate list (loose thresholds)
2. Candidates engine scores each symbol using Formula 6
3. Filters by candidate_score_min
4. Returns: candidate list + generation state

#### Paper Promotion (Section 2)
1. Candidates engine scores using Formula 7
2. Filters by promotion_score_min and strong_promotion_score_min
3. Marks promotion_eligible and strong_promotion_eligible flags
4. Returns: promotable list + promotion scores

#### Paper Generation State (Section 8)
- `NO_CANDIDATES`: No acceptable symbols from leadership
- `CANDIDATES_FOUND`: Ranked list exists, nothing crossed promotion threshold
- `CANDIDATES_FOUND_PROMOTION_QUALIFIED`: Candidates exist and promotion-qualified symbols exist

#### Empty State Messages (Section 9)
When no paper trades created:
- "No paper trades — no leadership candidates generated"
- "No paper trades — candidates found, but promotion threshold not met"
- "No paper trades — risk gate blocked promotion"
- "No paper trades — contradictory flow blocked directional setup"

### Flows are Non-Blocking (Section 5)

Flows now map like this:
- `LONG` => +0.8 modifier (confirmation)
- `SHORT` => -0.5 modifier (contradiction if regime is opposite)
- `NEUTRAL` => 0.0 modifier (no effect)
- `CONTRADICTORY` => -0.5 modifier (blocking)

**Important:** Neutral flows do NOT veto candidate generation.

### Leadership Output Extensions (Section 4)

Leadership engine now returns:
```python
{
    'qualifying_candidates_count': int,           # Candidates for generation
    'qualifying_promotion_count': int,            # Promotion-qualified
    'coverage_for_candidates': float,             # % universe for generation
    'coverage_for_promotion': float,              # % universe for promotion
    'top_candidates': dict,                       # Top 5 candidate symbols
    'top_promotable_candidates': dict,            # Top 5 promotable symbols
    'paper_generation_state': str,                # Generation state
    'coverage_threshold_candidate': float,
    'coverage_threshold_promotion': float,
}
```

### Advisor Output Extensions (Section 10)

Advisor now returns:
```python
{
    'paper_generation_state': str,                # Current state
    'candidate_count': int,                       # All candidates
    'promotion_qualified_count': int,             # Promotion-qualified
    'strong_promotion_count': int,                # Strong tier
    'top_candidate_symbol': str,
    'top_candidate_score': float,
    'top_promotable_symbol': str,
    'candidates_detail': dict,                    # Full candidates engine output
}
```

### Database Persistence (Section 11)

#### paper_candidates table
```sql
CREATE TABLE paper_candidates (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES runs(id),
  timestamp TIMESTAMPTZ,
  symbol TEXT,
  direction TEXT,
  candidate_score FLOAT,
  promotion_score FLOAT,
  leadership_score FLOAT,
  regime_alignment FLOAT,
  flow_modifier FLOAT,
  volume_confirmation FLOAT,
  execution_context FLOAT,
  promotion_eligible BOOLEAN,
  strong_promotion_eligible BOOLEAN,
  candidate_status TEXT,  -- 'generated' | 'promoted' | 'blocked'
  block_reason TEXT,
  components JSONB,
  created_at TIMESTAMPTZ
);
```

#### runs table extensions
```sql
ALTER TABLE runs ADD COLUMN candidate_count INTEGER;
ALTER TABLE runs ADD COLUMN promotion_qualified_count INTEGER;
ALTER TABLE runs ADD COLUMN strong_promotion_count INTEGER;
ALTER TABLE runs ADD COLUMN top_candidate_symbol TEXT;
ALTER TABLE runs ADD COLUMN top_candidate_score FLOAT;
ALTER TABLE runs ADD COLUMN paper_generation_state TEXT;
ALTER TABLE runs ADD COLUMN promotion_block_reason TEXT;
```

### UI Changes (Section 12)

#### Leadership Card
Replace simple leader count with:
- `Candidates: N`
- `Promotable: M`
- `Coverage: X%`
- `Avg candidate score: Y`

#### Decision Page
Add:
- `Candidates Found`
- `Promotion-Qualified`
- `Top Candidate`
- `Paper Generation State`

#### Paper Actions Panel
If no trades created, show:
- "No candidates generated" vs
- "Candidates found; promotion threshold not met" vs
- "Risk gate blocked promotion"

### Diagnostics (Section 13)

Persist and expose:
- Leadership coverage % for candidates
- Number of candidate-eligible symbols
- Number of promotion-eligible symbols
- Top 5 candidate scores
- Lowest blocking threshold hit
- Flow contradiction impact

### Testing Strategy (Section 14)

Run replay on last 20–50 sessions and capture:
1. Runs with directional regime → count candidates
2. Candidates-to-promotion conversion rate
3. Paper trade frequency by market regime

**Target metrics:**
- Candidates on 30–60% of directional runs
- Paper promotions on 10–25% of directional runs

### Acceptance Criteria (Section 16)

✓ System generates candidates in valid directional markets
✓ Neutral flows do not veto candidate generation
✓ Leadership generates candidates without collapsing to zero
✓ Paper trades promoted selectively from candidate list
✓ Empty states explain whether failure is generation or promotion
✓ Replay confirms nonzero paper-trade frequency without explosion

### Implementation Checklist

- [x] Add config thresholds (leadership, candidate_scoring, paper_execution)
- [x] Extend Leadership engine for candidate generation
- [x] Create CandidatesEngine with Formulas 6 & 7
- [x] Update Advisor to call CandidatesEngine
- [x] Add paper_candidates persistence
- [x] Extend runs table with state/counts
- [x] Update main.py to pass run_validity
- [ ] Write UI components for candidate display
- [ ] Run replay analysis on 20–50 sessions
- [ ] Tune thresholds based on replay evidence
- [ ] Update frontend components (Leadership card, Decision panel)

### Migration Steps

1. **Database:**
   ```bash
   # Apply migrations to Supabase
   supabase migration up
   ```

2. **Config:**
   Update `config/default.yaml` with new thresholds (already done)

3. **Code:**
   All engine and persistence changes are backward-compatible

4. **Testing:**
   ```bash
   python -m pytest tests/ -v
   python pipeline/backtest.py --config config/backtest.yaml
   ```

5. **Validation:**
   Run 5–10 live pipeline executions and verify:
   - Candidate counts are nonzero on directional runs
   - Paper generation state is populated
   - Candidates table is populated
   - Empty state messages are appropriate

### Common Issues & Resolution

**Issue:** `Candidates found, but promotion_count = 0`
- **Cause:** Candidate scores are above generation threshold but below promotion threshold
- **Expected:** This is healthy; means discovery working but execution bar is high
- **Action:** Either lower promotion_score_min or verify regime strength

**Issue:** `No candidates found on strong regime day`
- **Cause:** Leadership coverage below candidate generation threshold
- **Action:** Lower coverage_min_for_candidate_generation in config

**Issue:** `Promotion scores all zero`
- **Cause:** Liquidity scores or risk sizing fit defaults are broken
- **Action:** Check CandidatesEngine.calculate_promotion_scores() defaults

### References

- Spec attachment: `steadyalpha-paper-trade-generation-tuning-spec.md`
- Config: `config/default.yaml` (sections: leadership, candidate_scoring, paper_execution)
- Engines: `pipeline/engines/candidates.py`, `pipeline/engines/leadership.py`, `pipeline/engines/advisor.py`
- Persistence: `pipeline/persist.py`, `supabase/migrations/`
- Orchestration: `pipeline/main.py` (line 208+)

### Next Steps

1. Deploy migrations to Supabase
2. Run pipeline locally to verify candidate generation
3. Implement UI changes for Leadership card and Decision panel
4. Run 20–50 replay sessions to validate conversion rates
5. Tune thresholds based on replay evidence
