"""
SteadyAlpha Trade Manager
Phase 3 & 4: Active Trade Monitoring
"""

import pandas as pd
from typing import Dict, Any, List

class TradeManager:
    def __init__(self, db_manager):
        self.db = db_manager

    def evaluate_open_trades(self, current_price: float, current_date: str) -> List[Dict[str, Any]]:
        """
        Fetch open trades, check SL/TP, and close if hit.
        """
        if not self.db or not self.db.supabase:
            return []
            
        closed_trades = []
        try:
            # 1. Fetch Open Trades
            res = self.db.supabase.table('paper_trades').select('*').eq('status', 'open').execute()
            open_trades = res.data
            
            # 2. Evaluate each
            for trade in open_trades:
                entry_price = float(trade['entry_price'])
                direction = trade['direction']
                trade_id = trade['id']
                
                # Mock TP/SL logic (1.5% SL, 3% TP)
                # In real scenario, fetch these from order sizing_basis
                sl_pct = 0.015
                tp_pct = 0.03
                
                close_reason = None
                
                if direction == 'LONG':
                    if current_price <= entry_price * (1 - sl_pct):
                        close_reason = 'stop_loss'
                    elif current_price >= entry_price * (1 + tp_pct):
                        close_reason = 'target_hit'
                elif direction == 'SHORT':
                    if current_price >= entry_price * (1 + sl_pct):
                        close_reason = 'stop_loss'
                    elif current_price <= entry_price * (1 - tp_pct):
                        close_reason = 'target_hit'
                        
                if close_reason:
                    self.db.close_paper_trade(trade_id, current_price, close_reason)
                    closed_trades.append({
                        'trade_id': trade_id,
                        'exit_price': current_price,
                        'reason': close_reason
                    })
                    print(f"Closed trade {trade_id} -> {close_reason} @ {current_price}")
                    
        except Exception as e:
            print(f"TradeManager evaluation failed: {e}")
            
        return closed_trades
