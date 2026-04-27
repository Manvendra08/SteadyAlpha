"""
SteadyAlpha Advisor
Spec Section 5: Signal Integration & Recommendation

Responsibilities:
1. Aggregate signals from Regime, Flows, and Leadership engines.
2. Apply weighted voting logic.
3. Detect conflicts between engines.
4. Adjust confidence based on conflicts and data quality.
5. Output final recommendation to signals_summary.
"""

import yaml
import numpy as np
from typing import Dict, Any, Optional

class Advisor:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('advisor', {})
        
        self.weights = self.config.get('weights', {'regime': 0.40, 'flows': 0.25, 'leadership': 0.20, 'options': 0.15})
        self.conf_adj = self.config.get('confidence_adjustments', {
            'conflict_penalty': 0.2,
            'low_data_penalty': 0.3
        })

    def normalize_regime(self, regime_state: Dict[str, Any]) -> float:
        """
        Map regime state to [-1, 1].
        """
        state = regime_state.get('state', 'RANGE')
        trend_score = regime_state.get('trend_score', 0.0)
        
        # Base mapping
        if 'BULLISH' in state:
            base = 1.0
        elif 'BEARISH' in state:
            base = -1.0
        else:
            base = 0.0
            
        # Modulate by trend score magnitude
        # trend_score is roughly [-1, 1]
        return base * abs(trend_score)

    def normalize_flows(self, flows_state: Dict[str, Any]) -> float:
        """
        Map flows score to [-1, 1].
        flows_score is already normalized in FlowsEngine.
        """
        return flows_state.get('flows_score', 0.0)

    def normalize_leadership(self, leadership_state: Dict[str, Any]) -> float:
        """
        Map leadership state to [-1, 1].
        Based on leaders_count and avg_score.
        """
        leaders_count = leadership_state.get('leaders_count', 0)
        universe_size = leadership_state.get('universe_size', 1)
        avg_score = leadership_state.get('avg_score', 0.0)
        
        # Ratio of leaders
        leader_ratio = leaders_count / max(universe_size, 1)
        
        # If avg_score is positive and many leaders -> Bullish
        # If avg_score is negative and few leaders -> Bearish
        
        # Simple mapping:
        # High leader ratio + positive avg_score = 1.0
        # Low leader ratio + negative avg_score = -1.0
        
        # Normalize avg_score (Z-score usually around -2 to 2)
        norm_avg = np.clip(avg_score, -2, 2) / 2.0
        
        # Combine
        # If avg_score is negative, leader_ratio should be low (bearish confirmation)
        # If avg_score is positive, leader_ratio should be high (bullish confirmation)
        
        score = norm_avg * (2 * leader_ratio) # Weight by participation
        
        return np.clip(score, -1, 1)

    def detect_conflicts(self, regime_val: float, flows_val: float, leadership_val: float) -> bool:
        """
        Detect if engines disagree significantly.
        """
        values = [regime_val, flows_val, leadership_val]
        
        # Check signs
        signs = [np.sign(v) for v in values]
        
        # Conflict if signs are mixed (e.g., +1, -1, +1)
        # Ignore 0
        non_zero_signs = [s for s in signs if s != 0]
        
        if not non_zero_signs:
            return False
            
        return len(set(non_zero_signs)) > 1

    def run(self, regime_state: Dict[str, Any], flows_state: Dict[str, Any], 
            leadership_state: Dict[str, Any], risk_state: Dict[str, Any],
            options_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main execution method.
        """
        # 1. Normalize Inputs
        regime_val = self.normalize_regime(regime_state)
        flows_val = self.normalize_flows(flows_state)
        leadership_val = self.normalize_leadership(leadership_state)
        options_val = options_state.get('score', 0.0)
        
        # 2. Weighted Score
        weighted_score = (
            self.weights['regime'] * regime_val +
            self.weights['flows'] * flows_val +
            self.weights['leadership'] * leadership_val +
            self.weights['options'] * options_val
        )
        
        # 3. Conflict Detection
        conflict = self.detect_conflicts(regime_val, flows_val, leadership_val)
        
        # 4. Confidence Calculation
        base_confidence = abs(weighted_score)
        
        if conflict:
            base_confidence *= (1.0 - self.conf_adj['conflict_penalty'])
            
        # Check Risk State for overrides
        risk_status = risk_state.get('status', 'ACTIVE')
        if risk_status == 'HALTED':
            weighted_score = 0.0
            base_confidence = 0.0
            conflict = True # Forced conflict/halt
            
        # 5. Determine Action
        reasoning = []
        if risk_status == 'HALTED':
            action = 'HALT'
            reasoning.append("Risk Circuit Breaker Active")
        elif weighted_score > 0.3:
            action = 'LONG'
            reasoning.append(f"Strong weighted score ({weighted_score:.2f})")
        elif weighted_score < -0.3:
            # 5a. Short Approval Record logic (v0.6.1)
            if regime_val > -0.1:
                action = 'NEUTRAL'
                reasoning.append("SHORT rejected: lacks bearish regime confirmation (v0.6.1 gate)")
            else:
                action = 'SHORT'
                reasoning.append(f"Strong bearish score ({weighted_score:.2f})")
        else:
            action = 'NEUTRAL'
            reasoning.append("Score within neutral zone")
            
        # 6. Construct Output
        advisor_state = {
            'action': action,
            'reasoning': reasoning,
            'score': round(float(weighted_score), 4),
            'confidence': round(float(base_confidence), 4),
            'conflict_detected': conflict,
            'components': {
                'regime': round(float(regime_val), 4),
                'flows': round(float(flows_val), 4),
                'leadership': round(float(leadership_val), 4),
                'options': round(float(options_val), 4)
            },
            'risk_override': risk_status == 'HALTED'
        }
        
        return advisor_state
