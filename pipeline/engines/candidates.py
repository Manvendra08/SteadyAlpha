"""
SteadyAlpha Candidates Layer
Paper Trade Generation Tuning Spec v0.7.1

Responsibilities:
1. Generate ranked candidate list from leadership engine output.
2. Calculate candidate scores based on spec formula (Section 6).
3. Calculate promotion scores based on spec formula (Section 7).
4. Determine promotion eligibility for each candidate.
5. Output candidate generation state (Section 8).
"""

import yaml
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional


class CandidatesEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.scoring_config = config.get('candidate_scoring', {})
            self.paper_config = config.get('paper_execution', {})
            self.leadership_config = config.get('leadership', {})
        
        # Spec 6: Candidate Score Formula Weights
        self.w_leadership_symbol_score = self.scoring_config.get('w_leadership_symbol_score', 0.40)
        self.w_regime_alignment_score = self.scoring_config.get('w_regime_alignment_score', 0.25)
        self.w_volume_confirmation_score = self.scoring_config.get('w_volume_confirmation_score', 0.15)
        self.w_flow_modifier_score = self.scoring_config.get('w_flow_modifier_score', 0.10)
        self.w_execution_context_score = self.scoring_config.get('w_execution_context_score', 0.10)
        
        # Spec 7: Promotion Score Formula Weights
        self.w_candidate_score = self.scoring_config.get('w_candidate_score', 0.35)
        self.w_liquidity_quality_score = self.scoring_config.get('w_liquidity_quality_score', 0.20)
        self.w_risk_sizing_fit = self.scoring_config.get('w_risk_sizing_fit', 0.15)
        self.w_leadership_confidence = self.scoring_config.get('w_leadership_confidence', 0.15)
        self.w_flow_confirmation = self.scoring_config.get('w_flow_confirmation', 0.15)
        
        # Thresholds
        self.promotion_score_min = self.leadership_config.get('promotion_score_min', 0.18)
        self.strong_promotion_score_min = self.leadership_config.get('strong_promotion_score_min', 0.30)

    def calculate_regime_alignment_score(self, regime_vote: str, leadership_vote: str) -> float:
        """
        Alignment score: +1.0 if regime and leadership align, else lower score.
        Returns [0, 1.0] score indicating alignment confidence.
        """
        if regime_vote == leadership_vote and regime_vote in ('LONG', 'SHORT'):
            return 1.0
        elif regime_vote in ('LONG', 'SHORT') and leadership_vote == 'NEUTRAL':
            return 0.6  # Partial credit for one strong signal
        elif regime_vote in ('LONG', 'SHORT') and leadership_vote in ('WEAK', 'NO_QUALIFIERS'):
            return 0.4
        else:
            return 0.1  # Misalignment or both neutral

    def calculate_volume_confirmation_score(self, leadership_state: Dict[str, Any]) -> float:
        """
        Volume confirmation: how many qualified candidates exist relative to universe.
        Returns [0, 1.0] score indicating volume/breadth confidence.
        """
        qualifying_count = leadership_state.get('qualifying_candidates_count', 0)
        universe_size = leadership_state.get('universe_size', 1)
        
        # Score based on breadth: more qualifying candidates = higher score
        if universe_size == 0:
            return 0.0
        
        breadth = qualifying_count / universe_size
        # Map: 0% → 0, 10% → 0.3, 25% → 0.6, 50%+ → 1.0
        if breadth >= 0.50:
            return 1.0
        elif breadth >= 0.25:
            return 0.6
        elif breadth >= 0.10:
            return 0.3
        else:
            return 0.1

    def calculate_flow_modifier_score(self, flows_state: Dict[str, Any], regime_vote: str) -> float:
        """
        Flow modifier: positive if aligned, neutral if neutral, negative if contradictory.
        Returns [-1.0, 1.0] modifier score.
        """
        flows_bias = flows_state.get('directional_vote')
        if not flows_bias:
            score = flows_state.get('flows_score', 0.0)
            if score > 0.2:
                flows_bias = 'LONG'
            elif score < -0.2:
                flows_bias = 'SHORT'
            else:
                flows_bias = 'NEUTRAL'
        
        if flows_bias == 'NEUTRAL':
            return 0.0  # Spec 5: Neutral flows are zero modifier, not a veto
        elif flows_bias == regime_vote and regime_vote in ('LONG', 'SHORT'):
            return 0.8  # Strong confirmation
        elif flows_bias != regime_vote and flows_bias in ('LONG', 'SHORT') and regime_vote in ('LONG', 'SHORT'):
            return -0.5  # Contradiction
        else:
            return 0.0

    def calculate_execution_context_score(self, risk_state: Dict[str, Any], run_validity: str) -> float:
        """
        Execution context: can we actually execute based on risk and data validity?
        Returns [0, 1.0] score.
        """
        risk_status = risk_state.get('status', 'ACTIVE')
        
        # Risk gate must be passable (not halted)
        if risk_status == 'HALTED':
            return 0.0
        elif risk_status == 'REDUCED':
            return 0.6
        
        # Data validity: must be YES or DEGRADED
        if run_validity == 'YES':
            return 1.0
        elif run_validity == 'DEGRADED':
            return 0.7
        else:
            return 0.0

    def calculate_candidate_scores(
        self,
        leadership_state: Dict[str, Any],
        regime_vote: str,
        flows_state: Dict[str, Any],
        risk_state: Dict[str, Any],
        run_validity: str,
    ) -> List[Dict[str, Any]]:
        """
        Spec 6: Calculate candidate scores for all qualifying candidates.
        Returns list of dicts with symbol, candidate_score, and components.
        """
        candidates = leadership_state.get('top_candidates', {})
        if not candidates:
            return []
        
        # Calculate component scores
        regime_alignment = self.calculate_regime_alignment_score(regime_vote, leadership_state.get('directional_vote', 'NEUTRAL'))
        volume_confirmation = self.calculate_volume_confirmation_score(leadership_state)
        flow_modifier = self.calculate_flow_modifier_score(flows_state, regime_vote)
        execution_context = self.calculate_execution_context_score(risk_state, run_validity)
        
        # Normalize flow_modifier to [0, 1] for scoring
        flow_modifier_normalized = max(0.0, min(1.0, (flow_modifier + 1.0) / 2.0))
        
        candidate_scores = []
        for symbol, details in candidates.items():
            # Spec 6 Formula
            leadership_score = abs(float(details.get('composite_raw', 0.0)))
            leadership_score = max(0.0, min(1.0, leadership_score))  # Clip to [0, 1]
            
            candidate_score = (
                self.w_leadership_symbol_score * leadership_score +
                self.w_regime_alignment_score * regime_alignment +
                self.w_volume_confirmation_score * volume_confirmation +
                self.w_flow_modifier_score * flow_modifier_normalized +
                self.w_execution_context_score * execution_context
            )
            
            candidate_scores.append({
                'symbol': symbol,
                'candidate_score': round(float(candidate_score), 4),
                'leadership_score': round(float(leadership_score), 4),
                'regime_alignment': round(float(regime_alignment), 4),
                'volume_confirmation': round(float(volume_confirmation), 4),
                'flow_modifier': round(float(flow_modifier), 4),
                'execution_context': round(float(execution_context), 4),
                'components': {
                    'leadership': round(float(leadership_score), 4),
                    'regime': round(float(regime_alignment), 4),
                    'volume': round(float(volume_confirmation), 4),
                    'flow': round(float(flow_modifier_normalized), 4),
                    'execution': round(float(execution_context), 4),
                }
            })
        
        return sorted(candidate_scores, key=lambda x: x['candidate_score'], reverse=True)

    def calculate_promotion_scores(
        self,
        candidate_scores: List[Dict[str, Any]],
        liquidity_scores: Optional[Dict[str, float]] = None,
        risk_sizing_fit: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Spec 7: Calculate promotion scores from candidate scores.
        Higher bar than candidates; promotion requires strong multi-factor support.
        Returns candidates with promotion_score added, filtered to promotable tier.
        """
        if not candidate_scores:
            return []
        
        promotion_scores = []
        for candidate in candidate_scores:
            base_candidate_score = candidate['candidate_score']
            
            # Default scores if not provided
            symbol = candidate['symbol']
            liquidity_quality = liquidity_scores.get(symbol, 0.7) if liquidity_scores else 0.7
            risk_fit = risk_sizing_fit.get(symbol, 0.7) if risk_sizing_fit else 0.7
            leadership_confidence = candidate['leadership_score']
            flow_confirmation = max(0.0, 1.0 - abs(candidate['flow_modifier']))  # 1.0 if no contradiction
            
            # Spec 7 Formula (stricter than candidate score)
            promotion_score = (
                self.w_candidate_score * base_candidate_score +
                self.w_liquidity_quality_score * liquidity_quality +
                self.w_risk_sizing_fit * risk_fit +
                self.w_leadership_confidence * leadership_confidence +
                self.w_flow_confirmation * flow_confirmation
            )
            
            promotion_scores.append({
                **candidate,
                'promotion_score': round(float(promotion_score), 4),
                'liquidity_quality': round(float(liquidity_quality), 4),
                'risk_sizing_fit': round(float(risk_fit), 4),
                'flow_confirmation': round(float(flow_confirmation), 4),
                'promotion_eligible': promotion_score >= self.promotion_score_min,
                'strong_promotion_eligible': promotion_score >= self.strong_promotion_score_min,
            })
        
        return promotion_scores

    def run(
        self,
        leadership_state: Dict[str, Any],
        regime_vote: str,
        flows_state: Dict[str, Any],
        risk_state: Dict[str, Any],
        run_validity: str,
    ) -> Dict[str, Any]:
        """
        Orchestrate candidate generation and promotion scoring.
        Returns comprehensive candidate generation state.
        """
        # Step 1: Calculate candidate scores
        candidate_scores = self.calculate_candidate_scores(
            leadership_state, regime_vote, flows_state, risk_state, run_validity
        )
        
        # Step 2: Calculate promotion scores
        promotion_scores = self.calculate_promotion_scores(candidate_scores)
        
        # Step 3: Determine generation state
        qualifying_candidates = [c for c in promotion_scores if c['candidate_score'] > 0.0]
        promotable_candidates = [c for c in promotion_scores if c['promotion_eligible']]
        strongly_promotable = [c for c in promotion_scores if c['strong_promotion_eligible']]
        
        # Spec 8: Determine paper_generation_state
        if not qualifying_candidates:
            paper_generation_state = 'NO_CANDIDATES'
        elif promotable_candidates:
            paper_generation_state = 'CANDIDATES_FOUND_PROMOTION_QUALIFIED'
        else:
            paper_generation_state = 'CANDIDATES_FOUND'
        
        return {
            'paper_generation_state': paper_generation_state,
            'candidate_count': len(qualifying_candidates),
            'promotion_qualified_count': len(promotable_candidates),
            'strong_promotion_count': len(strongly_promotable),
            'top_candidate': promotion_scores[0] if promotion_scores else None,
            'top_candidate_symbol': promotion_scores[0]['symbol'] if promotion_scores else None,
            'top_candidate_score': promotion_scores[0]['candidate_score'] if promotion_scores else 0.0,
            'top_promotable': promotable_candidates[0] if promotable_candidates else None,
            'top_promotable_symbol': promotable_candidates[0]['symbol'] if promotable_candidates else None,
            'all_candidates_ranked': promotion_scores,
            'promotable_candidates': promotable_candidates,
            'strong_promotable_candidates': strongly_promotable,
            'thresholds': {
                'promotion_score_min': self.promotion_score_min,
                'strong_promotion_score_min': self.strong_promotion_score_min,
            }
        }
