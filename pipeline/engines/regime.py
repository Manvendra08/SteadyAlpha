"""
SteadyAlpha Regime Engine
Spec Section 1: Market Regime Detection

Responsibilities:
1. Calculate trend_score based on EMA distance, slope, and alignment.
2. Integrate VIX and Breadth inputs.
3. Determine regime state (6 states).
4. Apply hysteresis to prevent state flickering.
5. Output regime state to regime_history and signals_summary.
"""

import yaml
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Dict, Any, Optional

class RegimeEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('regime', {})
        
        self.trend_weights = self.config.get('trend_weights', {'ema_dist': 0.4, 'ema_slope': 0.3, 'ema_align': 0.3})
        self.trend_thresholds = self.config.get('trend_thresholds', {'bull': 0.5, 'bear': -0.5})
        self.vix_thresholds = self.config.get('vix_thresholds', {'high': 20.0, 'extreme': 30.0})
        self.breadth_thresholds = self.config.get('breadth_thresholds', {'bull': 0.6, 'bear': 0.4})
        self.hysteresis_days = self.config.get('hysteresis_days', 2)

    def calculate_ema_metrics(self, close: pd.Series) -> Dict[str, pd.Series]:
        """
        Calculate EMA distance, slope, and alignment.
        Uses 20, 50, 200 EMAs.
        """
        ema20 = close.ewm(span=20).mean()
        ema50 = close.ewm(span=50).mean()
        ema200 = close.ewm(span=200).mean()
        
        # 1. EMA Distance: (Price - EMA50) / EMA50
        # Normalized to roughly [-1, 1] range using tanh or clipping
        ema_dist_raw = (close - ema50) / ema50
        ema_dist = np.tanh(ema_dist_raw * 10) # Scale factor 10 to normalize typical % moves
        
        # 2. EMA Slope: Slope of EMA50
        # Calculated as (EMA50_t - EMA50_t-5) / EMA50_t-5
        ema_slope_raw = (ema50 - ema50.shift(5)) / ema50.shift(5)
        ema_slope = np.tanh(ema_slope_raw * 20)
        
        # 3. EMA Alignment: Order of EMAs
        # +1 if 20 > 50 > 200, -1 if 20 < 50 < 200, else 0
        # Smoothed over time
        bull_align = (ema20 > ema50) & (ema50 > ema200)
        bear_align = (ema20 < ema50) & (ema50 < ema200)
        
        align_raw = pd.Series(0, index=close.index)
        align_raw[bull_align] = 1
        align_raw[bear_align] = -1
        
        # Smooth alignment to avoid noise
        ema_align = align_raw.rolling(window=5).mean()
        
        return {
            'ema_dist': ema_dist,
            'ema_slope': ema_slope,
            'ema_align': ema_align
        }

    def calculate_trend_score(self, metrics: Dict[str, pd.Series]) -> pd.Series:
        """
        Weighted combination of EMA metrics.
        """
        w_dist = self.trend_weights['ema_dist']
        w_slope = self.trend_weights['ema_slope']
        w_align = self.trend_weights['ema_align']
        
        trend_score = (
            w_dist * metrics['ema_dist'] +
            w_slope * metrics['ema_slope'] +
            w_align * metrics['ema_align']
        )
        return trend_score

    def determine_base_regime(self, trend_score: float) -> str:
        """
        Map trend_score to base regime.
        """
        if trend_score >= self.trend_thresholds['bull']:
            return 'BULLISH'
        elif trend_score <= self.trend_thresholds['bear']:
            return 'BEARISH'
        else:
            return 'RANGE'

    def apply_volatility_modifier(self, base_regime: str, vix: float) -> str:
        """
        Append HIGH_VOL if VIX is elevated.
        """
        if vix >= self.vix_thresholds['extreme']:
            return f"VOLATILE_TREND" if base_regime != 'RANGE' else 'VOLATILE_RANGE'
        elif vix >= self.vix_thresholds['high']:
            return f"{base_regime}_HIGH_VOL"
        return base_regime

    def detect_shock(self, close: pd.Series, vix_series: Optional[pd.Series] = None) -> bool:
        """
        Detect a market shock.
        - 1-day return < -2% (for NIFTY)
        - VIX daily spike > 15%
        """
        if len(close) < 2:
            return False
            
        daily_ret = close.pct_change().iloc[-1]
        if daily_ret < -0.02: # 2% drop is a shock for an index
            return True
            
        if vix_series is not None and len(vix_series) >= 2:
            vix_spike = (vix_series.iloc[-1] - vix_series.iloc[-2]) / vix_series.iloc[-2]
            if vix_spike > 0.15: # 15% VIX spike
                return True
                
        return False

    def apply_hysteresis(self, current_state: str, previous_state: str, 
                         days_in_state: int) -> str:
        """
        Prevent rapid flipping.
        If switching from BULL to BEAR (or vice versa), require hysteresis_days.
        """
        if current_state == previous_state:
            return current_state
            
        # Check if transition is major (Bull <-> Bear)
        is_major_switch = (
            ('BULLISH' in previous_state and 'BEARISH' in current_state) or
            ('BEARISH' in previous_state and 'BULLISH' in current_state)
        )
        
        if is_major_switch and days_in_state < self.hysteresis_days:
            return previous_state # Hold previous state
            
        return current_state

    def run(self, close: pd.Series, vix: float, breadth_pct: float, 
            previous_state: Optional[str] = None, days_in_state: int = 0) -> Dict[str, Any]:
        """
        Main execution method.
        """
        # 1. Calculate Metrics
        metrics = self.calculate_ema_metrics(close)
        
        # Get latest values
        current_trend_score = metrics['ema_dist'].iloc[-1] * self.trend_weights['ema_dist'] + \
                              metrics['ema_slope'].iloc[-1] * self.trend_weights['ema_slope'] + \
                              metrics['ema_align'].iloc[-1] * self.trend_weights['ema_align']
        
        # 2. Determine Base Regime
        base_regime = self.determine_base_regime(current_trend_score)
        
        # 3. Apply Volatility
        final_regime = self.apply_volatility_modifier(base_regime, vix)
        
        # 3a. Detect Shock (v0.6.1)
        # Mocking vix_series for now as we only have scalar vix in run() signature
        is_shock = self.detect_shock(close)
        if is_shock:
            final_regime = "SHOCK"
        
        # 4. Apply Hysteresis
        is_transitioning = False
        if previous_state and final_regime != "SHOCK":
            intended_regime = final_regime
            final_regime = self.apply_hysteresis(final_regime, previous_state, days_in_state)
            if final_regime != intended_regime:
                is_transitioning = True
                final_regime = "TRANSITION"
        
        # 5. Construct Output
        regime_state = {
            'state': final_regime,
            'trend_score': round(float(current_trend_score), 4),
            'vix_value': round(float(vix), 2),
            'breadth_pct': round(float(breadth_pct), 4),
            'components': {
                'ema_dist': round(float(metrics['ema_dist'].iloc[-1]), 4),
                'ema_slope': round(float(metrics['ema_slope'].iloc[-1]), 4),
                'ema_align': round(float(metrics['ema_align'].iloc[-1]), 4)
            },
            'transition_reason': 'Shock' if is_shock else ('Hysteresis' if is_transitioning else 'Signal'),
            'is_transitioning': is_transitioning,
            'is_shock': is_shock
        }
        
        return regime_state
