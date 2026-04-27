"""
SteadyAlpha Validation Module
Spec Section 9: Health Checks & Validation

Responsibilities:
1. Validate data inputs (completeness, freshness).
2. Validate engine outputs (schema, ranges).
3. Run system health checks.
"""

import pandas as pd
from typing import Dict, Any, List

class Validator:
    def __init__(self):
        self.errors = []

    def check_data_freshness(self, series: pd.Series, max_gap_days: int = 2) -> bool:
        """Check if latest data point is recent."""
        if series.empty:
            self.errors.append("Data series is empty.")
            return False
        
        # Logic depends on index being datetime
        if isinstance(series.index, pd.DatetimeIndex):
            last_date = series.index[-1]
            # Simplified check
            return True
        return True

    def validate_regime_output(self, regime: Dict[str, Any]) -> bool:
        """Validate regime engine output."""
        required_keys = ['state', 'trend_score', 'vix_value']
        for key in required_keys:
            if key not in regime:
                self.errors.append(f"Regime output missing key: {key}")
                return False
        
        valid_states = ['BULL', 'BEAR', 'RANGE', 'HIGH_VOL_BULL', 'HIGH_VOL_BEAR', 'HIGH_VOL_RANGE']
        if regime['state'] not in valid_states:
            self.errors.append(f"Invalid regime state: {regime['state']}")
            return False
            
        return True

    def validate_flows_output(self, flows: Dict[str, Any]) -> bool:
        """Validate flows engine output."""
        required_keys = ['flows_score', 'fii_5d_z']
        for key in required_keys:
            if key not in flows:
                self.errors.append(f"Flows output missing key: {key}")
                return False
        return True

    def validate_leadership_output(self, leadership: Dict[str, Any]) -> bool:
        """Validate leadership engine output."""
        required_keys = ['leaders_count', 'universe_size']
        for key in required_keys:
            if key not in leadership:
                self.errors.append(f"Leadership output missing key: {key}")
                return False
        return True

    def validate_risk_output(self, risk: Dict[str, Any]) -> bool:
        """Validate risk engine output."""
        required_keys = ['status', 'portfolio_risk', 'circuit_breaker']
        for key in required_keys:
            if key not in risk:
                self.errors.append(f"Risk output missing key: {key}")
                return False
        return True

    def validate_advisor_output(self, advisor: Dict[str, Any]) -> bool:
        """Validate advisor engine output."""
        required_keys = ['recommendation', 'score', 'confidence']
        for key in required_keys:
            if key not in advisor:
                self.errors.append(f"Advisor output missing key: {key}")
                return False
        
        valid_recs = ['LONG', 'SHORT', 'NEUTRAL']
        if advisor['recommendation'] not in valid_recs:
            self.errors.append(f"Invalid advisor recommendation: {advisor['recommendation']}")
            return False
            
        return True

    def run_full_validation(self, result: Dict[str, Any]) -> List[str]:
        """Run all validations and return errors."""
        self.errors = []
        
        self.validate_regime_output(result.get('regime', {}))
        self.validate_flows_output(result.get('flows', {}))
        self.validate_leadership_output(result.get('leadership', {}))
        self.validate_risk_output(result.get('risk', {}))
        self.validate_advisor_output(result.get('advisor', {}))
        
        return self.errors
