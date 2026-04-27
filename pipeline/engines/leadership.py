"""
SteadyAlpha Leadership Engine
Spec Section 3: Market Leadership & Breadth

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
        Calculate Relative Strength score (v0.6.1).
        RS = Linear Regression Slope of (Stock / Benchmark) over 20 days.
        Normalized to Z-score across universe.
        """
        if stock_prices.empty or benchmark_prices.empty:
            return pd.Series(dtype=float)
        
        # Align dates
        common_idx = stock_prices.index.intersection(benchmark_prices.index)
        stocks = stock_prices.loc[common_idx]
        bench = benchmark_prices.loc[common_idx]
        
        if len(stocks) < self.rs_lookback:
            return pd.Series(0.0, index=stocks.columns)
            
        # Relative Strength Ratio
        rs_ratio_series = stocks.divide(bench, axis=0)
        
        # Calculate Slope using linear regression (last 20 days)
        # We can use numpy's polyfit or a simple covariance/variance formula
        # slope = cov(x, y) / var(x) where x is time [0..19]
        x = np.arange(self.rs_lookback)
        x_var = np.var(x)
        
        def get_slope(y_window):
            if len(y_window) < self.rs_lookback: return 0.0
            y = y_window.values
            cov = np.cov(x, y)[0, 1]
            return cov / x_var
            
        slopes = rs_ratio_series.iloc[-self.rs_lookback:].apply(get_slope)
        
        # Normalize to Z-score across universe
        rs_score = (slopes - slopes.mean()) / slopes.std()
        
        return rs_score.fillna(0)

    def calculate_vol_score(self, volume_series: pd.DataFrame) -> pd.Series:
        """
        Calculate Volume score.
        Current Volume / Average Volume (Vol Ratio).
        """
        if volume_series.empty:
            return pd.Series(dtype=float)
            
        if len(volume_series) < self.vol_lookback:
            avg_vol = volume_series.mean()
        else:
            avg_vol = volume_series.iloc[-self.vol_lookback:].mean()
            
        current_vol = volume_series.iloc[-1]
        
        vol_ratio = current_vol / avg_vol
        
        # Normalize
        vol_score = (vol_ratio - vol_ratio.mean()) / vol_ratio.std()
        
        return vol_score.fillna(0)

    def calculate_breakout_score(self, high_prices: pd.DataFrame) -> pd.Series:
        """
        Calculate Breakout score.
        Distance from 52-week high (breakout_lookback).
        Closer to high = Higher score.
        """
        if high_prices.empty:
            return pd.Series(dtype=float)
            
        if len(high_prices) < self.breakout_lookback:
            rolling_max = high_prices.max()
        else:
            rolling_max = high_prices.iloc[-self.breakout_lookback:].max()
            
        current_price = high_prices.iloc[-1] # Using high price series as proxy or close
        
        # Distance from high
        dist = (current_price - rolling_max) / rolling_max
        
        # Normalize
        # Dist is usually negative. Closer to 0 is better.
        # Invert so positive is better.
        breakout_score = (dist - dist.mean()) / dist.std()
        
        return breakout_score.fillna(0)

    def apply_filters(self, scores: pd.DataFrame, close_prices: pd.DataFrame, 
                      earnings_dates: Optional[Dict[str, datetime]] = None) -> pd.DataFrame:
        """
        Apply absolute filters.
        1. SMA50 > SMA200 (if configured)
        2. Price > SMA200 (if configured)
        3. Earnings Blackout
        """
        mask = pd.Series(True, index=scores.index)
        
        # SMA Filters
        if self.filters.get('sma50_above') or self.filters.get('sma200_above'):
            sma50 = close_prices.rolling(50).mean().iloc[-1]
            sma200 = close_prices.rolling(200).mean().iloc[-1]
            price = close_prices.iloc[-1]
            
            if self.filters.get('sma50_above'):
                mask &= (sma50 > sma200)
            if self.filters.get('sma200_above'):
                mask &= (price > sma200)
                
        # Earnings Blackout
        if earnings_dates and self.filters.get('earnings_blackout_days', 0) > 0:
            today = datetime.now(timezone.utc) # Or passed in date
            blackout_days = self.filters['earnings_blackout_days']
            
            for symbol in scores.index:
                if symbol in earnings_dates:
                    earnings_date = earnings_dates[symbol]
                    # Check if earnings is within blackout window
                    # Assuming earnings_date is future date
                    days_until = (earnings_date - today).days
                    if -blackout_days <= days_until <= blackout_days:
                        mask[symbol] = False
                        
        return scores[mask]

    def run(self, stock_prices: pd.DataFrame, volume_data: pd.DataFrame, 
            benchmark_prices: pd.Series, earnings_dates: Optional[Dict[str, datetime]] = None) -> Dict[str, Any]:
        """
        Main execution method.
        """
        # 1. Calculate Component Scores
        rs_scores = self.calculate_rs_score(stock_prices, benchmark_prices)
        vol_scores = self.calculate_vol_score(volume_data)
        # For breakout, we use high prices if available, else close
        breakout_scores = self.calculate_breakout_score(stock_prices) 
        
        # Align indices
        common_idx = rs_scores.index.intersection(vol_scores.index).intersection(breakout_scores.index)
        rs_scores = rs_scores[common_idx]
        vol_scores = vol_scores[common_idx]
        breakout_scores = breakout_scores[common_idx]
        
        # 2. Composite Score
        composite = (
            self.score_weights['rs'] * rs_scores +
            self.score_weights['vol'] * vol_scores +
            self.score_weights['breakout'] * breakout_scores
        )
        
        scores_df = pd.DataFrame({
            'symbol': composite.index,
            'composite_score': composite.values,
            'rs_score': rs_scores.values,
            'vol_score': vol_scores.values,
            'breakout_score': breakout_scores.values
        }).set_index('symbol')
        
        # 3. Apply Filters
        filtered_scores = self.apply_filters(scores_df, stock_prices, earnings_dates)
        
        # 4. Rank & Quintiles
        if filtered_scores.empty:
            return {'leaders_count': 0, 'universe_size': len(stock_prices.columns), 'avg_score': 0, 'top_sectors': [], 'blackout_count': 0}
            
        filtered_scores['rank'] = filtered_scores['composite_score'].rank(pct=True)
        
        # Quintiles
        q1_thresh = self.quintile_thresholds['q1']
        leaders = filtered_scores[filtered_scores['rank'] >= q1_thresh]
        
        # 5. Construct Output
        leadership_state = {
            'universe_size': len(stock_prices.columns),
            'leaders_count': len(leaders),
            'avg_score': round(float(filtered_scores['composite_score'].mean()), 4),
            'top_sectors': [], # Requires sector mapping logic, placeholder
            'blackout_count': len(scores_df) - len(filtered_scores),
            'details': leaders.head(10).to_dict(orient='index') # Top 10 leaders
        }
        
        return leadership_state
