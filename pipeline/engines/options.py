"""
SteadyAlpha Options Analysis Engine
Spec Section 6A: Derivatives Intelligence

Responsibilities:
1. Calculate IV Rank (1-year lookback).
2. Identify Put/Call OI Walls and distance to spot.
3. Track Daily OI Shifts and PCR (OI) acceleration.
4. Output options state to options_history and signals_summary.
"""

import yaml
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional

class OptionsEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('options', {})
            
        self.iv_lookback = self.config.get('iv_lookback', 252)
        self.oi_wall_threshold = self.config.get('oi_wall_threshold', 1.5) # Multiplier of avg OI
        self.weights = self.config.get('weights', {'iv_rank': 0.3, 'oi_walls': 0.4, 'oi_shift': 0.3})

    def calculate_iv_rank(self, iv_series: pd.Series) -> float:
        """
        Calculate IV Rank: (Current IV - Min IV) / (Max IV - Min IV)
        """
        if iv_series.empty or len(iv_series) < 20:
            return 0.5
            
        window = iv_series.iloc[-self.iv_lookback:]
        iv_min = window.min()
        iv_max = window.max()
        current_iv = iv_series.iloc[-1]
        
        if iv_max == iv_min:
            return 0.0
            
        iv_rank = (current_iv - iv_min) / (iv_max - iv_min)
        return round(float(iv_rank), 4)

    def analyze_oi_walls(self, spot_price: float, option_chain: Any) -> Dict[str, Any]:
        """
        Identify Call/Put OI walls and distance from spot.
        option_chain should have columns: [strike, type, open_interest]
        """
        if option_chain is None:
            return {'call_wall': None, 'put_wall': None, 'dist_to_call': 1.0, 'dist_to_put': 1.0}

        # Convert dict to DataFrame if needed (from SCRAPED source)
        if isinstance(option_chain, dict):
            rows = option_chain.get('rows', [])
            # Create a simple DataFrame assuming R360 structure
            # Header texts found: ['OPEN INTEREST', 'VOLUME', 'IV', 'PREMIUM', '', 'STRIKE', '', 'PREMIUM', 'IV', 'VOLUME', 'OPEN INTEREST']
            # We want Strike (idx 5), Call OI (idx 0), Put OI (idx 10)
            df_rows = []
            for r in rows:
                if len(r) >= 11:
                    try:
                        strike = float(r[5].replace(",", ""))
                        c_oi = float(r[0].replace(",", "").split()[0]) if r[0] else 0
                        p_oi = float(r[10].replace(",", "").split()[0]) if r[10] else 0
                        df_rows.append({'strike': strike, 'type': 'CE', 'open_interest': c_oi})
                        df_rows.append({'strike': strike, 'type': 'PE', 'open_interest': p_oi})
                    except:
                        continue
            option_chain = pd.DataFrame(df_rows)

        if not isinstance(option_chain, pd.DataFrame) or option_chain.empty:
            return {'call_wall': None, 'put_wall': None, 'dist_to_call': 1.0, 'dist_to_put': 1.0}
            
        calls = option_chain[option_chain['type'] == 'CE']
        puts = option_chain[option_chain['type'] == 'PE']
        
        call_wall = calls.loc[calls['open_interest'].idxmax(), 'strike'] if not calls.empty else None
        put_wall = puts.loc[puts['open_interest'].idxmax(), 'strike'] if not puts.empty else None
        
        dist_to_call = (call_wall - spot_price) / spot_price if call_wall and spot_price else 1.0
        dist_to_put = (spot_price - put_wall) / spot_price if put_wall and spot_price else 1.0
        
        return {
            'call_wall': float(call_wall) if call_wall else None,
            'put_wall': float(put_wall) if put_wall else None,
            'dist_to_call': round(float(dist_to_call), 4),
            'dist_to_put': round(float(dist_to_put), 4)
        }

    def run(self, spot_price: float, iv_series: pd.Series, 
            option_chain: Any, pcr_oi_series: pd.Series) -> Dict[str, Any]:
        """
        Main execution method.
        """
        # 1. Components
        iv_rank = self.calculate_iv_rank(iv_series)
        walls = self.analyze_oi_walls(spot_price, option_chain)
        
        # OI Shift (1-day change in PCR OI)
        oi_shift = 0.0
        if pcr_oi_series is not None and len(pcr_oi_series) >= 2:
            try:
                oi_shift = (pcr_oi_series.iloc[-1] - pcr_oi_series.iloc[-2]) / pcr_oi_series.iloc[-2]
            except:
                oi_shift = 0.0
            
        # 2. Score Calculation
        # High IV Rank is usually bearish (fear), Low IV bullish (complacency)
        # But we use it as a volatility modifier
        iv_score = 1.0 - (2.0 * iv_rank) # Normalized to [-1, 1]
        
        # Walls Score: Being close to a Put wall is bullish (support), close to Call wall bearish (resistance)
        wall_score = 0.0
        if walls['dist_to_put'] < 0.02: # Within 2% of put wall
            wall_score = 0.8
        elif walls['dist_to_call'] < 0.02: # Within 2% of call wall
            wall_score = -0.8
            
        # 3. Construct Output
        options_state = {
            'iv_rank': iv_rank,
            'oi_pcr': round(float(pcr_oi_series.iloc[-1]), 4) if pcr_oi_series is not None and not pcr_oi_series.empty else 0.0,
            'oi_shift': round(float(oi_shift), 4),
            'walls': walls,
            'score': round(float(iv_score * 0.3 + wall_score * 0.7), 4) # Weighted options score
        }
        
        return options_state
