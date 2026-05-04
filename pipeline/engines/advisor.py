"""
SteadyAlpha Advisor
Spec Section 5: Signal Integration & Recommendation
Final Tuning Spec v1.2 + Paper Trade Generation Tuning v0.7.1

Responsibilities:
1. Aggregate signals from Regime, Flows, and Leadership engines.
2. Separate engine validity from directional contribution.
3. Split confidence math from final action mapping.
4. Generate semantically precise decision summaries.
5. Orchestrate candidate generation for paper trading.
"""

import yaml
import numpy as np
from typing import Dict, Any, List, Optional
from pipeline.engines.candidates import CandidatesEngine

class Advisor:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('advisor', {})
            self.paper_config = config.get('paper_execution', {})
        
        # Spec 1.0: Calibration Weights
        self.w_regime = self.config.get('w_regime', 0.45)
        self.w_flows = self.config.get('w_flows', 0.30)
        self.w_leadership = self.config.get('w_leadership', 0.25)
        
        # Spec 5.0: Action Thresholds
        self.watchlist_floor = 0.05 # Paper Floor
        self.promotion_floor = self.paper_config.get('min_confidence', 0.18)
        if self.promotion_floor > 1.0: # If in pct format (e.g. 18.0)
            self.promotion_floor /= 100.0
        
        # Paper Trade Generation Tuning v0.7.1: Candidates Engine
        self.candidates_engine = CandidatesEngine(config_path)

    def get_engine_votes(self, regime_state: Dict[str, Any], flows_state: Dict[str, Any], 
                         leadership_state: Dict[str, Any], risk_state: Dict[str, Any]) -> Dict[str, str]:
        """
        Spec #1: Map engines to directional votes.
        """
        votes = {}
        
        # Regime Vote
        reg_state = regime_state.get('state', 'RANGE_BOUND').upper()
        if reg_state in ['BULLISH', 'TREND_UP']: votes['regime'] = 'LONG'
        elif reg_state in ['BEARISH', 'TREND_DOWN']: votes['regime'] = 'SHORT'
        elif reg_state == 'TRANSITION': votes['regime'] = 'WEAK'
        else: votes['regime'] = 'NEUTRAL'
        
        # Flows Vote (Spec 1.3: Non-blocking neutral)
        flows_bias = flows_state.get('directional_vote')
        if not flows_bias:
            score = flows_state.get('flows_score', 0.0)
            if score > 0.2: flows_bias = 'LONG'
            elif score < -0.2: flows_bias = 'SHORT'
            else: flows_bias = 'NEUTRAL'
        votes['flows'] = flows_bias
        
        # Leadership Vote (Spec 1.1: Decoupled)
        lead_bias = leadership_state.get('directional_vote')
        if not lead_bias:
            lead_count = leadership_state.get('leaders_count', 0)
            lag_count = leadership_state.get('laggards_count', 0)
            if lead_count > lag_count and lead_count > 0: lead_bias = 'LONG'
            elif lag_count > lead_count and lag_count > 0: lead_bias = 'SHORT'
            else: lead_bias = 'NEUTRAL'
        votes['leadership'] = lead_bias
        
        # Risk Vote
        risk_status = risk_state.get('status', 'ACTIVE')
        if risk_status == 'HALTED': votes['risk'] = 'BLOCKED'
        elif risk_status == 'REDUCED': votes['risk'] = 'CAUTION'
        else: votes['risk'] = 'PASS_EXECUTION'
        
        return votes

    def run(self, regime_state: Dict[str, Any], flows_state: Dict[str, Any], 
            leadership_state: Dict[str, Any], risk_state: Dict[str, Any],
            mode: str = 'PAPER', run_validity: str = 'YES') -> Dict[str, Any]:
        
        # 1. Engine Validity & Votes
        votes = self.get_engine_votes(regime_state, flows_state, leadership_state, risk_state)
        
        validity = {
            'regime': regime_state.get('validity_status', 'VALID'),
            'flows': flows_state.get('validity_status', 'VALID'),
            'leadership': leadership_state.get('validity_status', 'VALID'),
            'risk': risk_state.get('validity_status', 'VALID')
        }
        
        # 2. Extract normalized scores [0, 1] for confidence
        regime_score = abs(regime_state.get('trend_score', 0.0))
        # Regime score is often 0-10, normalize if needed. Assume it's already a confidence-like float or normalize.
        if regime_score > 1.0: regime_score = min(regime_score / 10.0, 1.0)
        
        flows_score = abs(flows_state.get('flows_score', 0.0))
        if flows_score > 1.0: flows_score = min(flows_score / 3.0, 1.0) # Flows Z-scores can be 3+
        
        leadership_score = abs(leadership_state.get('leadership_score', 0.0))
        if leadership_score == 0.0: # Fallback to avg_score if leadership_score missing
            leadership_score = abs(leadership_state.get('avg_score', 0.0))
        
        # 3. Directional Confidence (weighted score)
        directional_confidence = (
            regime_score * self.w_regime +
            flows_score * self.w_flows +
            leadership_score * self.w_leadership
        )
        
        # 3b. Paper Trade Generation Tuning v0.7.1: Generate Candidates
        regime_vote = votes['regime']
        candidates_state = self.candidates_engine.run(
            leadership_state=leadership_state,
            regime_vote=regime_vote,
            flows_state=flows_state,
            risk_state=risk_state,
            run_validity=run_validity
        )
        
        # 4. Action Confidence (Execution Quality)
        # Apply alignment bonus
        alignment_score = 1.0
        active_votes = [v for v in [votes['regime'], votes['flows'], votes['leadership']] if v in ('LONG', 'SHORT')]
        if len(set(active_votes)) == 1 and len(active_votes) >= 2:
            alignment_score = 1.2
            
        action_confidence = directional_confidence * alignment_score
        
        # Penalty for degraded engines
        if any(v == 'DEGRADED' for v in validity.values()):
            action_confidence *= 0.8
        if any(v == 'INVALID' for v in validity.values()):
            action_confidence *= 0.5

        # 5. Final Action Mapping
        bias = votes['regime'] if votes['regime'] in ('LONG', 'SHORT') else 'NEUTRAL'
        
        action = 'NO_TRADE'
        blocking_reason = None
        
        if votes['risk'] == 'BLOCKED':
            action = 'NO_TRADE'
            blocking_reason = "Risk Circuit Breaker Active"
        elif bias == 'NEUTRAL':
            action = 'NO_TRADE'
            blocking_reason = "Regime is Neutral/Range-bound"
        else:
            if mode == 'PAPER':
                if action_confidence >= self.promotion_floor:
                    action = f"PAPER_ELIGIBLE_{bias}"
                elif action_confidence >= self.watchlist_floor:
                    action = f"WATCHLIST_{bias}"
                else:
                    action = "NO_TRADE"
                    blocking_reason = "Confidence below watchlist floor"
            else: # LIVE
                if action_confidence >= 0.45: # Live threshold usually higher
                    action = f"LIVE_TRADE_{bias}"
                else:
                    action = f"WATCHLIST_{bias}"

        # 6. Reason Buckets
        drivers = []
        if votes['regime'] != 'NEUTRAL': drivers.append(f"Regime {votes['regime']} Bias")
        if votes['flows'] == votes['regime']: drivers.append("Flows Alignment")
        if votes['leadership'] == votes['regime']: drivers.append("Leadership Confirmation")
        
        drags = []
        if votes['flows'] == 'NEUTRAL': drags.append("Flows Neutral")
        if votes['leadership'] in ('NEUTRAL', 'WEAK', 'NO_QUALIFIERS'): drags.append("Leadership Weak")
        if any(v == 'DEGRADED' for v in validity.values()): drags.append("Degraded Data Inputs")

        # 7. Top Line Summary (Spec 5.0)
        driver_str = f"Regime {bias}" if bias != 'NEUTRAL' else "No directional driver"
        escalation_str = ""
        if action == 'NO_TRADE' and blocking_reason:
            escalation_str = f"blocked by: {blocking_reason}"
        elif "WATCHLIST" in action:
            escalation_str = "watchlist only; secondary support insufficient"
        elif "PAPER_ELIGIBLE" in action:
            escalation_str = "promotion threshold met with alignment"
        else:
            escalation_str = "monitoring setup"

        summary = f"{driver_str} supports {action.replace('_', ' ')}; {escalation_str}."
        if votes['risk'] == 'BLOCKED':
            summary = f"Action forced to NO TRADE: {blocking_reason}."

        return {
            'action': action,
            'top_line_summary': summary,
            'directional_confidence': round(float(directional_confidence), 4),
            'action_confidence': round(float(action_confidence), 4),
            'confidence': round(float(action_confidence), 4),
            'validity_status': validity,
            'directional_votes': votes,
            'reasoning': drivers + drags,
            'reason_buckets': {
                'drivers': drivers,
                'boosters': [f"Alignment Score: {alignment_score:.1f}x"],
                'drags': drags,
                'gates': [f"Risk: {votes['risk']}", f"Mode: {mode}"]
            },
            'confidence_calibration': {
                'contributions': {
                    'regime': round(float(regime_score * self.w_regime), 4),
                    'flows': round(float(flows_score * self.w_flows), 4),
                    'leadership': round(float(leadership_score * self.w_leadership), 4),
                    'bonus': round(float(directional_confidence * (alignment_score - 1.0)), 4),
                    'penalty': round(float(directional_confidence * alignment_score * (1.0 - (0.8 if any(v == 'DEGRADED' for v in validity.values()) else 0.5 if any(v == 'INVALID' for v in validity.values()) else 1.0))), 4) if any(v in ('DEGRADED', 'INVALID') for v in validity.values()) else 0.0
                },
                'watchlist_floor_met': directional_confidence >= self.watchlist_floor,
                'promotion_threshold_met': action_confidence >= self.promotion_floor,
                'alignment_bonus': round(float(alignment_score), 2),
                'blocking_reason': blocking_reason
            },
            # Paper Trade Generation Tuning v0.7.1: Candidate Generation Output (Section 10)
            'paper_generation_state': candidates_state['paper_generation_state'],
            'candidate_count': candidates_state['candidate_count'],
            'promotion_qualified_count': candidates_state['promotion_qualified_count'],
            'strong_promotion_count': candidates_state['strong_promotion_count'],
            'top_candidate_symbol': candidates_state['top_candidate_symbol'],
            'top_candidate_score': candidates_state['top_candidate_score'],
            'top_promotable_symbol': candidates_state['top_promotable_symbol'],
            'candidates_detail': candidates_state
        }

