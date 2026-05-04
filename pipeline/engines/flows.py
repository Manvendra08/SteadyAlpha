"""
SteadyAlpha Flows Engine
Spec Section 2: Institutional Flows & Sentiment

Responsibilities:
1. Calculate FII 5-day net flow Z-score.
2. Calculate PCR (Put-Call Ratio) smoothed percentile.
3. Calculate Sector Relative Strength (RS) spread.
4. Compute weighted flows_score.
5. Output flows state to flows_history and signals_summary.
"""

import yaml
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

class FlowsEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('flows', {})
        
        self.fii_lookback = self.config.get('fii_lookback', 126)
        self.pcr_lookback = self.config.get('pcr_lookback', 63)
        self.pcr_smooth_window = self.config.get('pcr_smooth_window', 5)
        self.rs_spread_lookback = 20 # Aligned with leadership RS
        self.weights = self.config.get('weights', {'fii': 0.35, 'dii': 0.15, 'pcr': 0.25, 'rs_spread': 0.25})

    def calculate_fii_zscore(self, fii_net_flows: pd.Series) -> float:
        """
        Calculate Z-score of 5-day rolling sum of FII flows over lookback period.
        """
        if fii_net_flows is None or fii_net_flows.empty or len(fii_net_flows) < 10:
            return 0.0
            
        lookback = min(len(fii_net_flows), self.fii_lookback)
        
        # 5-day rolling sum
        fii_5d = fii_net_flows.rolling(window=5).sum()
        
        # Z-score calculation
        # Use expanding or rolling window for mean/std to avoid look-ahead bias in backtest
        # For current state, we use the trailing lookback window stats
        window = fii_5d.iloc[-lookback:]
        mean = window.mean()
        std = window.std()
        
        if std == 0 or pd.isna(std):
            return 0.0
            
        current_val = fii_5d.iloc[-1]
        z_score = (current_val - mean) / std
        
        return round(float(z_score), 4)

    def calculate_pcr_percentile(self, pcr_series: pd.Series) -> float:
        """
        Calculate percentile of smoothed PCR within lookback window.
        """
        if pcr_series is None or pcr_series.empty or len(pcr_series) < self.pcr_lookback:
            return 0.5 # Neutral default
        
        # Smooth PCR
        pcr_smooth = pcr_series.rolling(window=self.pcr_smooth_window).mean()
        
        # Get window
        window = pcr_smooth.iloc[-self.pcr_lookback:]
        current_val = pcr_smooth.iloc[-1]
        
        if pd.isna(current_val):
            return 0.5
            
        # Percentile rank
        percentile = (window < current_val).sum() / len(window)
        
        return round(float(percentile), 4)

    def calculate_rs_spread(self, sector_returns: pd.DataFrame) -> float:
        """
        Calculate spread between top and bottom sector RS.
        RS is defined as return over lookback period.
        Spread = Top Quintile Return - Bottom Quintile Return.
        """
        if sector_returns.empty or sector_returns.shape[1] < 5:
            return 0.0
        
        # Calculate returns over lookback
        # Assuming input is price series. If returns, adjust logic.
        # Assuming input DataFrame columns are sectors, index is date.
        if len(sector_returns) < self.rs_spread_lookback:
            lookback = len(sector_returns)
        else:
            lookback = self.rs_spread_lookback
            
        # Simple return calculation
        start_prices = sector_returns.iloc[-lookback]
        end_prices = sector_returns.iloc[-1]
        
        returns = (end_prices - start_prices) / start_prices
        
        # Drop NaNs
        returns = returns.dropna()
        
        if returns.empty:
            return 0.0
            
        # Sort
        sorted_returns = returns.sort_values()
        
        # Quintiles
        n = len(sorted_returns)
        q1_threshold = int(n * 0.2)
        q5_threshold = int(n * 0.8)
        
        if q1_threshold == 0 or q5_threshold >= n:
            return 0.0
            
        bottom_q_mean = sorted_returns.iloc[:q1_threshold].mean()
        top_q_mean = sorted_returns.iloc[q5_threshold:].mean()
        
        spread = top_q_mean - bottom_q_mean
        
        return round(float(spread), 4)

    def run(self, fii_flows: pd.Series, dii_flows: pd.Series, pcr_data: pd.Series, 
            sector_prices: pd.DataFrame, max_pain: Optional[float] = None, 
            spot_price: Optional[float] = None, pcr_latest: Optional[float] = None) -> Dict[str, Any]:
        """
        Main execution method.
        """
        # 1. Calculate Components
        fii_z = self.calculate_fii_zscore(fii_flows)
        dii_z = self.calculate_fii_zscore(dii_flows) # Reusing Z-score logic for DII
        
        # PCR Logic: Priority to Series Percentile, Fallback to Scalar Normalization
        pcr_pct = self.calculate_pcr_percentile(pcr_data)
        if (pcr_data is None or len(pcr_data) < self.pcr_lookback) and pcr_latest is not None:
            # Map 0.3 -> 1.0 (Bullish), 1.0 -> 0.0 (Neutral), 1.7+ -> -1.0 (Bearish)
            pcr_norm = np.clip((1.0 - pcr_latest) / 0.7, -1, 1)
        else:
            pcr_norm = 1.0 - (2.0 * pcr_pct)
            
        rs_spread = self.calculate_rs_spread(sector_prices)
        
        # 2. Normalize Components to [-1, 1] or [0, 1] scale
        # FII Z-score: Clip to [-3, 3] and normalize
        fii_norm = np.clip(fii_z, -3, 3) / 3.0
        
        # DII Z-score: Same normalization
        dii_norm = np.clip(dii_z, -3, 3) / 3.0
        
        # RS Spread: Positive spread means leadership (Bullish). Negative means lagging (Bearish).
        # Normalize spread. Typical spread might be 0.2 to 0.5.
        rs_norm = np.clip(rs_spread * 2, -1, 1) # Scale factor 2
        
        # 2a. Absorption Logic (v0.6.1)
        is_absorption = False
        if fii_norm < -0.3 and dii_norm > 0.3:
            # Check if DII is absorbing a significant portion of FII selling
            # We use the 5-day rolling sums (latest values)
            fii_5d = fii_flows.rolling(5).sum().iloc[-1]
            dii_5d = dii_flows.rolling(5).sum().iloc[-1]
            if dii_5d > abs(fii_5d) * 0.7:
                is_absorption = True
        
        # 3. Weighted Score
        flows_score = (
            self.weights['fii'] * fii_norm +
            self.weights['dii'] * dii_norm +
            self.weights['pcr'] * pcr_norm +
            self.weights['rs_spread'] * rs_norm
        )
        
        if is_absorption:
            flows_score = max(flows_score, 0.1) # Boost to at least neutral-positive
        
        # 4. Construct Output
        directional_vote = "NEUTRAL"
        if flows_score > 0.18: directional_vote = "LONG"
        elif flows_score < -0.18: directional_vote = "SHORT"
        elif abs(flows_score) > 0.08: directional_vote = "WEAK"

        flows_state = {
            'flows_score': round(float(flows_score), 4),
            'validity_status': 'VALID' if (not fii_flows.empty and not pcr_data.empty) else 'DEGRADED',
            'directional_vote': directional_vote,
            'fii_5d_z': fii_z,
            'fii_net_daily': float(fii_flows.iloc[-1]) if not fii_flows.empty else 0.0,
            'dii_5d_z': dii_z,
            'dii_net_daily': float(dii_flows.iloc[-1]) if not dii_flows.empty else 0.0,
            'is_absorption': is_absorption,
            'pcr_smooth': round(float(pcr_pct), 4),
            'pcr_latest': pcr_latest,
            'rs_spread_pct': rs_spread,
            'max_pain': max_pain,
            'spot_price': spot_price,
            'spot_vs_max_pain_pct': round(((spot_price - max_pain) / max_pain * 100), 2) if (spot_price and max_pain and max_pain != 0) else 0.0,
            'components': {
                'fii_norm': round(float(fii_norm), 4),
                'dii_norm': round(float(dii_norm), 4),
                'pcr_norm': round(float(pcr_norm), 4),
                'rs_norm': round(float(rs_norm), 4)
            }
        }
        
        return flows_state
