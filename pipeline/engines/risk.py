"""
SteadyAlpha Risk Engine
Spec Section 4: Risk Logic, Sizing, and Circuit Breakers

Responsibilities:
1. Calculate ATR-based position sizing.
2. Enforce portfolio-level risk limits.
3. Enforce single-name risk limits.
4. Manage circuit breakers (drawdown limits).
5. Output risk state to risk_history and signals_summary.
"""

import yaml
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Dict, Any, Optional

class RiskEngine:
    def __init__(self, config_path: str = "config/default.yaml"):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            self.config = config.get('risk', {})
        
        self.base_risk_pct = self.config.get('base_risk_pct', 1.0) / 100.0
        self.max_portfolio_risk = self.config.get('max_portfolio_risk_pct', 6.0) / 100.0
        self.max_single_name_risk = self.config.get('max_single_name_risk_pct', 1.5) / 100.0
        self.atr_lookback = self.config.get('atr_lookback', 14)
        
        # Circuit Breaker
        self.cb_config = self.config.get('circuit_breaker', {})
        self.dd_limit = self.cb_config.get('drawdown_limit_pct', 10.0) / 100.0
        self.cb_lookback = self.cb_config.get('lookback_days', 20)

    def calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
        """Calculate ATR using Wilder's smoothing."""
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=self.atr_lookback).mean()
        return atr

    def calculate_position_size(self, entry_price: float, stop_loss: float, 
                                account_equity: float, atr: float) -> Dict[str, float]:
        """
        Calculate position size based on ATR and risk limits.
        
        Returns:
            dict with 'shares', 'risk_amount', 'risk_pct', 'stop_distance'
        """
        if entry_price <= 0 or atr <= 0:
            return {'shares': 0, 'risk_amount': 0, 'risk_pct': 0, 'stop_distance': 0}

        # Stop distance usually defined as multiple of ATR (e.g., 2x ATR)
        # Defaulting to 2x ATR for volatility-based stops
        atr_multiple = 2.0 
        stop_distance = atr * atr_multiple
        calculated_stop = entry_price - stop_distance
        
        # If user provided a tighter stop, use that
        if stop_loss > calculated_stop:
            stop_distance = entry_price - stop_loss
        
        risk_per_share = stop_distance
        
        # Base risk amount
        risk_amount = account_equity * self.base_risk_pct
        
        # Calculate shares
        shares = int(risk_amount / risk_per_share)
        
        # Cap by single name risk limit
        position_value = shares * entry_price
        max_position_value = account_equity * self.max_single_name_risk
        
        if position_value > max_position_value:
            shares = int(max_position_value / entry_price)
            position_value = shares * entry_price
            risk_amount = shares * risk_per_share

        actual_risk_pct = (risk_amount / account_equity) * 100

        return {
            'shares': shares,
            'risk_amount': round(risk_amount, 2),
            'risk_pct': round(actual_risk_pct, 2),
            'stop_distance': round(stop_distance, 2),
            'stop_price': round(entry_price - stop_distance, 2)
        }

    def check_portfolio_risk(self, current_positions: list, account_equity: float) -> Dict[str, Any]:
        """
        Check if total portfolio risk exceeds limits.
        
        Args:
            current_positions: List of dicts with 'risk_amount'
            account_equity: Total equity
        """
        total_risk = sum(p.get('risk_amount', 0) for p in current_positions)
        portfolio_risk_pct = (total_risk / account_equity) * 100
        
        breach = portfolio_risk_pct > (self.max_portfolio_risk * 100)
        
        return {
            'total_risk_amount': round(total_risk, 2),
            'portfolio_risk_pct': round(portfolio_risk_pct, 2),
            'limit_pct': self.max_portfolio_risk * 100,
            'breach': breach
        }

    def check_circuit_breaker(self, equity_curve: pd.Series) -> Dict[str, Any]:
        """
        Check if drawdown exceeds circuit breaker limit.
        """
        if equity_curve is None or equity_curve.empty or len(equity_curve) < 2:
            return {'active': False, 'drawdown': 0.0, 'limit': self.dd_limit * 100}

        # Lookback window
        window = equity_curve.iloc[-self.cb_lookback:] if len(equity_curve) >= self.cb_lookback else equity_curve
        peak = window.max()
        current = window.iloc[-1]
        
        drawdown = (peak - current) / peak
        
        active = drawdown >= self.dd_limit
        
        return {
            'active': active,
            'drawdown_pct': round(drawdown * 100, 2),
            'limit_pct': self.dd_limit * 100,
            'peak': round(peak, 2),
            'current': round(current, 2)
        }

    def run(self, account_equity: float, current_positions: list, 
            equity_curve: pd.Series, market_data: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
        """
        Main execution method.
        Returns risk state for signals_summary and risk_history.
        """
        # 1. Portfolio Risk Check
        portfolio_risk = self.check_portfolio_risk(current_positions, account_equity)
        
        # 2. Circuit Breaker Check
        cb_state = self.check_circuit_breaker(equity_curve)
        
        # 3. Construct Output
        status = 'HALTED' if cb_state['active'] or portfolio_risk['breach'] else 'ACTIVE'
        
        risk_state = {
            'portfolio_risk': portfolio_risk,
            'circuit_breaker': cb_state,
            'validity_status': 'VALID',
            'directional_vote': 'BLOCKED' if status == 'HALTED' else 'PASS_EXECUTION',
            'limits': {
                'max_portfolio_risk_pct': self.max_portfolio_risk * 100,
                'max_single_name_risk_pct': self.max_single_name_risk * 100,
                'base_risk_pct': self.base_risk_pct * 100
            },
            'status': status
        }
        
        return risk_state
