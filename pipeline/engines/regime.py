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
        
        self.min_confirm_days = self.config.get('min_confirm_days', 2)
        self.vix_thresholds = self.config.get('vix_thresholds', {'high': 20.0, 'extreme': 30.0})
        self.z_thresholds = {'bull': 0.5, 'bear': -0.5}

    def calculate_rs_slope_zscore(self, close: pd.Series) -> float:
        """
        Calculate the Z-score of the 20-day RS Slope of the benchmark.
        Since we don't have a broader benchmark, we use Price Slope normalized over 126 days.
        """
        if close is None or len(close) < 126:
            return 0.0
            
        # 20-day rolling slope
        def get_slope(y):
            if len(y) < 20: return np.nan
            x = np.arange(len(y))
            slope, _ = np.polyfit(x, y, 1)
            return slope / y.mean() # Percentage slope

        # We need a rolling slope series to calculate Z-score
        # For performance in a daily run, we only need the latest Z-score
        # But we need the history of slopes to get mean/std
        slopes = close.rolling(window=20).apply(get_slope)
        
        window = slopes.iloc[-126:]
        mean = window.mean()
        std = window.std()
        
        if std == 0 or pd.isna(std):
            return 0.0
            
        current_slope = slopes.iloc[-1]
        z_score = (current_slope - mean) / std
        return round(float(z_score), 4)

    def calculate_adx(self, high: pd.Series, low: pd.Series, close: pd.Series, window: int = 14) -> float:
        """
        Calculate Average Directional Index (ADX) using pure Pandas/Numpy.
        """
        if close is None or high is None or low is None or len(close) < window * 2:
            return 0.0
            
        prev_close = close.shift(1)
        
        tr = pd.concat([high - low, abs(high - prev_close), abs(low - prev_close)], axis=1).max(axis=1)
        atr = tr.rolling(window).mean()
        
        # Directional Movement
        plus_dm = high.diff().clip(lower=0)
        minus_dm = (-low.diff()).clip(lower=0)
        
        # Simple DI calculation
        plus_di = 100 * (plus_dm.rolling(window).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(window).mean() / atr)
        
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
        adx = dx.rolling(window).mean().iloc[-1]
        
        return round(float(adx), 2) if not np.isnan(adx) else 0.0

    def calculate_trend_score(self, z_score: float, adx: float) -> float:
        """
        Synthesizes Z-score and ADX into a normalized -1 to 1 trend score.
        """
        # Tangent mapping for Z-score (-1 to 1)
        z_comp = np.tanh(z_score)
        # ADX strength (0 to 1)
        adx_comp = min(adx / 50.0, 1.0)
        
        return round(float(z_comp * adx_comp), 4)

    def run(self, high: pd.Series, low: pd.Series, close: pd.Series, vix: float, breadth_pct: float, 
            previous_state: Optional[str] = None, days_in_state: int = 0) -> Dict[str, Any]:
        """
        Execute regime detection with Z-score thresholds and hysteresis.
        """
        # 1. Calculate Core Signal (RS Slope Z-score)
        trend_z = self.calculate_rs_slope_zscore(close)
        adx = self.calculate_adx(high, low, close)
        trend_score = self.calculate_trend_score(trend_z, adx)
        
        # 2. Base Classification
        if trend_z >= self.z_thresholds['bull']:
            base_regime = 'BULLISH'
        elif trend_z <= self.z_thresholds['bear']:
            base_regime = 'BEARISH'
        else:
            base_regime = 'RANGE'
            
        # 3. Volatility Modifier
        final_regime = base_regime
        if vix >= self.vix_thresholds.get('extreme', 30):
            final_regime = "VOLATILE_TREND" if base_regime != 'RANGE' else 'VOLATILE_RANGE'
        elif vix >= self.vix_thresholds.get('high', 20):
            final_regime = f"{base_regime}_HIGH_VOL"

        # 4. Shock Detection
        is_shock = False
        if len(close) >= 2:
            daily_ret = close.pct_change().iloc[-1]
            if daily_ret < -0.02: # 2% drop is a shock
                is_shock = True
                final_regime = "SHOCK"

        # 5. Hysteresis & Confirmation
        # Only switch if confirmed for X days, unless it's a SHOCK
        confirmed_regime = final_regime
        is_transitioning = False
        
        if previous_state and previous_state != "UNKNOWN" and final_regime != "SHOCK":
            # If state changed, we check if we have enough days to confirm
            if final_regime != previous_state:
                if days_in_state < self.min_confirm_days:
                    confirmed_regime = previous_state # Hold previous
                    is_transitioning = True
        
        # 6. Output
        directional_vote = "NEUTRAL"
        if "BULLISH" in confirmed_regime: directional_vote = "LONG"
        elif "BEARISH" in confirmed_regime: directional_vote = "SHORT"
        elif "VOLATILE" in confirmed_regime: directional_vote = "WEAK"
        elif confirmed_regime == "SHOCK": directional_vote = "SHORT"

        return {
            'state': confirmed_regime,
            'validity_status': 'VALID' if (len(close) >= 126 and vix > 0) else 'DEGRADED',
            'directional_vote': directional_vote,
            'trend_score': trend_score,
            'trend_z': trend_z,
            'adx': adx,
            'vix_value': round(float(vix), 2) if vix is not None else 0.0,
            'breadth_pct': round(float(breadth_pct), 4) if breadth_pct else 0.0,
            'is_shock': is_shock,
            'is_transitioning': is_transitioning,
            'days_in_state': days_in_state + 1 if confirmed_regime == previous_state else 1,
            'transition_reason': 'Shock' if is_shock else ('Confirmed' if not is_transitioning else 'Pending Confirmation')
        }
