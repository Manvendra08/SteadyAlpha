"""
SteadyAlpha Leadership Engine
Spec Section 3: Market Leadership & Breadth
Relaxation Spec v1.0 Implemented

Responsibilities:
1. Calculate composite leadership score (RS, Vol, Breakout).
2. Rank stocks into quintiles.
3. Apply absolute filters (SMA alignment, Earnings Blackout).
4. Identify top sectors and leaders count.
5. Output leadership state to leadership_history and signals_summary.
"""

import yaml
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from scipy.stats import zscore

class LeadershipEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('leadership', {})
        
        self.rs_lookback = self.config.get('rs_lookback', 20)
        self.vol_lookback = self.config.get('vol_lookback', 63)
        self.breakout_lookback = self.config.get('breakout_lookback', 126)
        
        self.score_weights = self.config.get('score_weights', {'rs': 0.5, 'vol': 0.25, 'breakout': 0.25})
        self.quintile_thresholds = self.config.get('quintile_thresholds', {'q1': 0.8, 'q5': 0.2})
        
        self.filters = self.config.get('filters', {
            'sma50_above': True,
            'sma200_above': True,
            'earnings_blackout_days': 3
        })

    def calculate_rs_score(self, stock_prices: pd.DataFrame, benchmark_prices: pd.Series) -> pd.Series:
        """
        Calculate Relative Strength score.
        Returns RAW slopes (normalized by mean) to preserve absolute signal.
        """
        if stock_prices is None or benchmark_prices is None or stock_prices.empty or benchmark_prices.empty:
            return pd.Series(dtype=float)
        
        common_idx = stock_prices.index.intersection(benchmark_prices.index)
        stocks = stock_prices.loc[common_idx]
        bench = benchmark_prices.loc[common_idx]
        
        if len(stocks) < self.rs_lookback:
            return pd.Series(0.0, index=stocks.columns)
            
        rs_ratio_series = stocks.divide(bench, axis=0)
        x = np.arange(self.rs_lookback)
        
        def get_slope(y_window):
            if len(y_window) < self.rs_lookback: return 0.0
            slope, _ = np.polyfit(x, y_window.values, 1)
            return slope / y_window.mean()
            
        slopes = rs_ratio_series.iloc[-self.rs_lookback:].apply(get_slope)
        return slopes.fillna(0)

    def calculate_vol_score(self, volume_series: pd.DataFrame) -> pd.Series:
        """
        Calculate Volume score.
        Returns Vol Ratio (Current / Avg) - 1.0.
        """
        if volume_series.empty:
            return pd.Series(dtype=float)
            
        lookback = min(len(volume_series), self.vol_lookback)
        avg_vol = volume_series.iloc[-lookback:].mean()
        current_vol = volume_series.iloc[-1]
        
        vol_ratio = current_vol / avg_vol
        return (vol_ratio - 1.0).fillna(0)

    def calculate_breakout_score(self, high_prices: pd.DataFrame) -> pd.Series:
        """
        Calculate Breakout score.
        Returns distance from high [-1, 0].
        """
        if high_prices.empty:
            return pd.Series(dtype=float)
            
        lookback = min(len(high_prices), self.breakout_lookback)
        rolling_max = high_prices.iloc[-lookback:].max()
        current_price = high_prices.iloc[-1]
        
        dist = (current_price - rolling_max) / rolling_max
        return dist.fillna(0)

    def apply_filters(self, scores: pd.DataFrame, close_prices: pd.DataFrame, 
                      earnings_dates: Optional[Dict[str, datetime]] = None) -> pd.DataFrame:
        mask = pd.Series(True, index=scores.index)
        
        if self.filters.get('sma50_above') or self.filters.get('sma200_above'):
            sma50 = close_prices.rolling(50).mean().iloc[-1]
            sma200 = close_prices.rolling(200).mean().iloc[-1]
            price = close_prices.iloc[-1]
            
            if self.filters.get('sma50_above'):
                mask &= (sma50 > sma200)
            if self.filters.get('sma200_above'):
                mask &= (price > sma200)
                
        return scores[mask]

    def run(self, stock_prices: pd.DataFrame, volume_data: pd.DataFrame, 
            benchmark_prices: pd.Series, earnings_dates: Optional[Dict[str, datetime]] = None) -> Dict[str, Any]:
        
        # 1. Calculate Raw Component Scores
        raw_rs = self.calculate_rs_score(stock_prices, benchmark_prices)
        raw_vol = self.calculate_vol_score(volume_data)
        raw_breakout = self.calculate_breakout_score(stock_prices)
        
        # 2. Normalize components to Z-scores for RANKING only
        z_rs = pd.Series(zscore(raw_rs), index=raw_rs.index)
        z_vol = pd.Series(zscore(raw_vol), index=raw_vol.index)
        z_breakout = pd.Series(zscore(raw_breakout), index=raw_breakout.index)
        
        common_idx = z_rs.index.intersection(z_vol.index).intersection(z_breakout.index)
        z_rs, z_vol, z_breakout = z_rs[common_idx], z_vol[common_idx], z_breakout[common_idx]
        raw_rs, raw_vol, raw_breakout = raw_rs[common_idx], raw_vol[common_idx], raw_breakout[common_idx]
        
        # 3. Composite Z-Score (for Ranking)
        composite_z = (
            self.score_weights['rs'] * z_rs +
            self.score_weights['vol'] * z_vol +
            self.score_weights['breakout'] * z_breakout
        )
        
        # 4. Composite Raw Score (for Absolute Signal / Breadth)
        # Scaled to be roughly [-1, 1]
        composite_raw = (
            self.score_weights['rs'] * np.clip(raw_rs * 50, -1, 1) + # 2% slope = 1.0
            self.score_weights['vol'] * np.clip(raw_vol, -1, 1) +   # 2x vol = 1.0
            self.score_weights['breakout'] * np.clip(raw_breakout * 10, -1, 1) # 10% off high = -1.0
        )
        
        scores_df = pd.DataFrame({
            'symbol': common_idx,
            'composite_z': composite_z.values,
            'composite_raw': composite_raw.values
        }).set_index('symbol')
        
        # 5. Apply Filters
        filtered_scores = self.apply_filters(scores_df, stock_prices, earnings_dates)
        
        if filtered_scores.empty:
            return {'leaders_count': 0, 'universe_size': len(stock_prices.columns), 'avg_score': 0, 'engine_status': 'READY'}
            
        # 6. Rank & Quintiles (using Z-scores)
        filtered_scores['rank'] = filtered_scores['composite_z'].rank(pct=True)
        
        # Leaders are Top Quintile AND must have positive raw composite
        leaders = filtered_scores[(filtered_scores['rank'] >= 0.8) & (filtered_scores['composite_raw'] > 0.1)]
        laggards = filtered_scores[(filtered_scores['rank'] <= 0.2) & (filtered_scores['composite_raw'] < -0.1)]
        
        # 7. Construct Output
        universe_size = len(stock_prices.columns)
        coverage_pct = round(len(filtered_scores) / universe_size, 4) if universe_size > 0 else 0.0
        
        # Spec 1.1: Directional Vote logic
        directional_vote = "NEUTRAL"
        if len(leaders) > len(laggards) and len(leaders) >= 1:
            directional_vote = "LONG"
        elif len(laggards) > len(leaders) and len(laggards) >= 1:
            directional_vote = "SHORT"
        elif len(leaders) == 0 and len(laggards) == 0:
            directional_vote = "NO_QUALIFIERS"
        else:
            directional_vote = "WEAK"

        leadership_state = {
            'universe_size': universe_size,
            'filtered_count': len(filtered_scores),
            'coverage_pct': coverage_pct,
            'leaders_count': len(leaders),
            'laggards_count': len(laggards),
            'avg_score': round(float(filtered_scores['composite_raw'].mean()), 4),
            'breadth_pct': round(float(len(leaders) / len(filtered_scores)), 4) if not filtered_scores.empty else 0.0,
            'engine_status': 'READY',
            'validity_status': 'VALID' if coverage_pct >= 0.5 else 'DEGRADED',
            'directional_vote': directional_vote,
            'thresholds': {
                'min_coverage_pct': 0.5,
                'min_leaders_for_vote': 1
            },
            'details': {
                'leaders': leaders.sort_values('composite_z', ascending=False).head(10).to_dict(orient='index'),
                'laggards': laggards.sort_values('composite_z', ascending=True).head(10).to_dict(orient='index')
            }
        }
        
        return leadership_state
