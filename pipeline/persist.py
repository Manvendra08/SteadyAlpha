"""
SteadyAlpha Persistence Layer
Spec Section 6: Database Schema & Storage

Responsibilities:
1. Connect to Supabase.
2. Insert run metadata.
3. Insert JSONB signals summary.
4. Insert flattened history records.
5. Handle errors and retries.
"""

import os
from supabase import create_client, Client
from typing import Dict, Any, Optional
import json

class PersistenceManager:
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not url or not key:
            print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env")
            raise ValueError("Credentials missing.")
        
        try:
            self.supabase: Client = create_client(url, key)
        except Exception as e:
            print(f"Supabase Client Init Failed: {e}")
            raise

    def get_latest_regime_state(self) -> dict:
        """Fetch the most recent regime state and calculate days_in_state."""
        try:
            # Fetch last 50 runs to calculate consecutive days
            resp = self.supabase.table("regime_history").select("state").order("timestamp", desc=True).limit(50).execute()
            if not resp or not resp.data:
                return {"state": "UNKNOWN", "days_in_state": 0}
            
            data = resp.data
            current_state = data[0]["state"]
            days_in_state = 0
            
            for row in data:
                if row["state"] == current_state:
                    days_in_state += 1
                else:
                    break
            
            return {"state": current_state, "days_in_state": days_in_state}
        except Exception as e:
            print(f"Error fetching latest regime: {e}")
            return {"state": "UNKNOWN", "days_in_state": 0}

    def insert_run(self, run_id: str, timestamp: str, status: str, duration_ms: int,
                   validity: str = "NO", invalid_reasons: list = [], 
                   paper_allowed: bool = False) -> None:
        """Insert into runs table with validity metadata (v0.7.0)."""
        data = {
            'id': run_id,
            'timestamp': timestamp,
            'status': status,
            'duration_ms': duration_ms,
            'errors': [],
            'meta': {
                'validity': validity,
                'invalid_reasons': invalid_reasons,
                'paper_allowed': paper_allowed
            }
        }
        self.supabase.table('runs').insert(data).execute()

    def insert_provenance(self, run_id: str, timestamp: str, provenance: dict) -> None:
        """Insert dataset provenance (source_type, freshness, criticality) into run_provenance table."""
        rows = []
        for key, info in provenance.items():
            rows.append({
                'run_id': run_id,
                'timestamp': timestamp,
                'dataset_key': key,
                'provider': info.get('provider'),
                'source_type': info.get('source_type'),
                'freshness': info.get('freshness'),
                'criticality': info.get('criticality'),
                'trading_valid': info.get('trading_valid', False),
                'record_count': info.get('record_count', 0),
                'error': info.get('error'),
                'warning': info.get('warning')
            })
        
        if rows:
            self.supabase.table('run_provenance').insert(rows).execute()

    def insert_signals_summary(self, run_id: str, timestamp: str, 
                               regime: Dict, flows: Dict, 
                               leadership: Dict, risk: Dict, 
                               advisor: Dict, previews: list = []) -> None:
        """Insert into signals_summary (JSONB columns)."""
        data = {
            'run_id': run_id,
            'timestamp': timestamp,
            'regime': regime,
            'flows': flows,
            'leadership': leadership,
            'risk': risk,
            'advisor': advisor,
            'meta': {
                'raw_data_previews': previews
            }
        }
        self.supabase.table('signals_summary').insert(data).execute()

    def insert_regime_history(self, run_id: str, timestamp: str, regime: Dict) -> None:
        """Insert flattened regime data into history."""
        data = {
            'run_id': run_id,
            'timestamp': timestamp,
            'state': regime.get('state'),
            'trend_score': regime.get('trend_score'),
            'vix_value': regime.get('vix_value'),
            'breadth_pct': regime.get('breadth_pct'),
            'transition_reason': regime.get('transition_reason'),
            'raw_inputs': {
                'trend_z': regime.get('trend_z'),
                'is_shock': regime.get('is_shock'),
                'is_transitioning': regime.get('is_transitioning'),
                'days_in_state': regime.get('days_in_state')
            }
        }
        self.supabase.table('regime_history').insert(data).execute()

    def insert_flows_history(self, run_id: str, timestamp: str, flows: Dict) -> None:
        """Insert flattened flows data."""
        data = {
            'run_id': run_id,
            'timestamp': timestamp,
            'flows_score': flows.get('flows_score'),
            'fii_5d_z': flows.get('fii_5d_z'),
            'pcr_smooth': flows.get('pcr_smooth'),
            'rs_spread_pct': flows.get('rs_spread'),
            'components': flows.get('components', {})
        }
        self.supabase.table('flows_history').insert(data).execute()

    def insert_leadership_history(self, run_id: str, timestamp: str, leadership: Dict) -> None:
        """Insert leadership metrics."""
        data = {
            'run_id': run_id,
            'timestamp': timestamp,
            'leaders_count': leadership.get('leaders_count'),
            'avg_score': leadership.get('avg_score'),
            'top_sectors': leadership.get('top_sectors', {}),
            'blackout_count': leadership.get('blackout_count', 0),
            'details': leadership.get('details', [])
        }
        self.supabase.table('leadership_history').insert(data).execute()

    def insert_risk_history(self, run_id: str, timestamp: str, risk: Dict) -> None:
        """Insert risk state."""
        data = {
            'run_id': run_id,
            'timestamp': timestamp,
            'reason': risk.get('status'),
            'portfolio_risk_pct': risk.get('portfolio_risk', {}).get('portfolio_risk_pct'),
            'max_position_risk_pct': risk.get('limits', {}).get('max_single_name_risk_pct'),
            'circuit_breaker_active': risk.get('circuit_breaker', {}).get('active', False),
            'reason': risk.get('status'),
            'limits': risk.get('limits', {})
        }
        self.supabase.table('risk_history').insert(data).execute()

    def persist_full_run(self, result: Dict[str, Any], duration_ms: int) -> None:
        """
        Master persistence method.
        Wraps individual inserts in a transaction-like flow (Supabase RPC or sequential).
        """
        run_id = result['run_id']
        # 0. Clean numpy types for JSON serialization
        def clean_types(obj):
            if isinstance(obj, dict):
                return {k: clean_types(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_types(v) for v in obj]
            elif hasattr(obj, 'item'): # numpy types
                return obj.item()
            elif hasattr(obj, 'isoformat'): # datetime
                return obj.isoformat()
            return obj

        clean_result = clean_types(result)
        timestamp_str = clean_result['timestamp']
        
        try:
            # 1. Run Meta
            self.insert_run(
                run_id, timestamp_str, 'success', duration_ms,
                validity=clean_result.get('run_validity', 'NO'),
                invalid_reasons=clean_result.get('invalid_reasons', []),
                paper_allowed=clean_result.get('paper_promotion_allowed', False)
            )
            
            # 2. Provenance (v0.7.0)
            if 'provenance' in clean_result:
                self.insert_provenance(run_id, timestamp_str, clean_result['provenance'])
            
            # 3. Summary
            self.insert_signals_summary(
                run_id, timestamp_str,
                clean_result['regime'], clean_result['flows'],
                clean_result['leadership'], clean_result['risk'],
                clean_result['advisor'],
                previews=clean_result.get('raw_data_previews', [])
            )
            
            # 4. History Tables
            self.insert_regime_history(run_id, timestamp_str, clean_result['regime'])
            self.insert_flows_history(run_id, timestamp_str, clean_result['flows'])
            self.insert_leadership_history(run_id, timestamp_str, clean_result['leadership'])
            self.insert_risk_history(run_id, timestamp_str, clean_result['risk'])
            
            # 5. Paper Execution
            if 'paper_orders' in clean_result:
                for order in clean_result['paper_orders']:
                    self.create_paper_order(run_id, order)
                    
            if 'paper_trades' in clean_result:
                for trade in clean_result['paper_trades']:
                    self.create_paper_trade(run_id, trade)
            
            print(f"Persisted run {run_id} successfully.")
            
        except Exception as e:
            print(f"Error persisting run {run_id}: {e}")
            # Update run status to failed
            try:
                self.supabase.table('runs').update({'status': 'failed', 'errors': [str(e)]}).eq('id', run_id).execute()
            except:
                pass

    def create_paper_order(self, run_id: str, order: Dict[str, Any]) -> None:
        """Insert into paper_orders table (v0.6.1)."""
        data = {
            'run_id': run_id,
            'source_signal_key': order.get('source_signal_key', f"{run_id}:advisor"),
            'source_engine': order.get('source_engine', 'advisor'),
            'symbol': order.get('symbol'),
            'direction': order.get('direction'),
            'requested_qty': order.get('requested_qty', 0),
            'confidence_at_entry': order.get('confidence_at_entry', 0.0),
            'risk_pct': order.get('risk_pct', 0.0),
            'sizing_basis': order.get('sizing_basis', {}),
            'status': order.get('status', 'pending'),
            'rejection_reason': order.get('rejection_reason')
        }
        self.supabase.table('paper_orders').insert(data).execute()

    def create_paper_trade(self, run_id: str, trade: Dict[str, Any]) -> None:
        """Insert into paper_trades table (v0.6.1)."""
        data = {
            'paper_order_id': trade.get('paper_order_id'),
            'run_id': run_id,
            'symbol': trade.get('symbol'),
            'direction': trade.get('direction'),
            'qty': trade.get('qty', 0),
            'status': 'open',
            'entry_price': trade.get('entry_price'),
            'entry_at': trade.get('entry_at', datetime.now(timezone.utc).isoformat()),
            'simulation_version': trade.get('simulation_version', 'v0.6.1')
        }
        self.supabase.table('paper_trades').insert(data).execute()

    def mark_paper_order_status(self, order_id: str, status: str, reason: Optional[str] = None) -> None:
        """Update paper_order status."""
        update_data = {'status': status, 'updated_at': datetime.now(timezone.utc).isoformat()}
        if reason:
            update_data['rejection_reason'] = reason
        self.supabase.table('paper_orders').update(update_data).eq('id', order_id).execute()

    def close_paper_trade(self, trade_id: str, exit_price: float, exit_reason: str) -> None:
        """Close a paper trade and calculate PnL."""
        # Note: In a real implementation, we'd fetch entry_price and qty here to calc PnL
        # For now, we update the status and exit fields
        update_data = {
            'status': 'closed',
            'exit_price': exit_price,
            'exit_at': datetime.now(timezone.utc).isoformat(),
            'exit_reason': exit_reason,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        self.supabase.table('paper_trades').update(update_data).eq('id', trade_id).execute()
