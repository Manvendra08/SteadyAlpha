import os
import uuid
import datetime
import json
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

class SupabaseClient:
    def __init__(self):
        self.base_url = f"{SUPABASE_URL}/rest/v1"
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def insert(self, table: str, data: dict):
        url = f"{self.base_url}/{table}"
        try:
            with httpx.Client() as client:
                response = client.post(url, headers=self.headers, json=data)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Supabase Error (Insert {table}): {e}")
            return None

    def update(self, table: str, filters: dict, data: dict):
        # Construct filter query string
        query = "&".join([f"{k}=eq.{v}" for k, v in filters.items()])
        url = f"{self.base_url}/{table}?{query}"
        try:
            with httpx.Client() as client:
                response = client.patch(url, headers=self.headers, json=data)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Supabase Error (Update {table}): {e}")
            return None

    def upsert(self, table: str, data: dict, on_conflict: str):
        url = f"{self.base_url}/{table}"
        headers = self.headers.copy()
        headers["Prefer"] = f"resolution=merge-duplicates,return=representation"
        try:
            with httpx.Client() as client:
                response = client.post(url, headers=headers, json=data)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Supabase Error (Upsert {table}): {e}")
            return None

db = SupabaseClient()

def register_run(trigger_type: str, code_version: str, config_snapshot: dict) -> str:
    """Inserts a new run into run_registry and returns the run_id."""
    run_id = str(uuid.uuid4())
    data = {
        "run_id": run_id,
        "trigger_type": trigger_type,
        "code_version": code_version,
        "config_snapshot": config_snapshot
    }
    db.insert("run_registry", data)
    print(f"Registered run {run_id} in Supabase")
    return run_id

def update_run_status(run_id: str, status: str, error_summary: str = None):
    """Updates the status and completed_at time for a run."""
    data = {
        "status": status,
        "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    if error_summary:
        data["error_summary"] = error_summary
    db.update("run_registry", {"run_id": run_id}, data)
    print(f"Run {run_id} status updated to {status} in Supabase")

def update_health(pipeline_id: str, run_id: str, status: str):
    """Updates the pipeline_health table."""
    data = {
        "pipeline_id": pipeline_id,
        "last_run_id": run_id,
        "status": status,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    db.upsert("pipeline_health", data, on_conflict="pipeline_id")
    print(f"Pipeline {pipeline_id} health updated to {status} in Supabase")

def log_engine_audit(run_id: str, input_digest: str, output_digest: str, signals: dict):
    """Logs engine execution audit trail."""
    data = {
        "run_id": run_id,
        "input_digest": input_digest,
        "output_digest": output_digest,
        "engine_outputs": signals
    }
    db.insert("engine_audit", data)

def upsert_signals_summary(run_id: str, signals: dict):
    """Updates global signals summary."""
    data = {
        "run_id": run_id,
        "regime_state": signals["regime_state"],
        "regime_score": signals["regime_score"],
        "regime_changed": signals["regime_changed"],
        "flows_bias": signals["flows_bias"],
        "fii_net": signals["fii_net"],
        "dii_net": signals["dii_net"],
        "pcr_value": signals["pcr_value"],
        "pcr_percentile": signals["pcr_percentile"],
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    # Using run_id as PK for summary is simple for now, or just insert
    db.insert("signals_summary", data)

def create_paper_order(
    run_id: str,
    source_signal_key: str,
    symbol: str,
    direction: str,
    requested_qty: int,
    confidence_at_entry: float,
    risk_pct: float,
    sizing_basis: dict,
    status: str,
    rejection_reason: str = None,
) -> str:
    """Creates a paper order row and returns paper_order_id."""
    paper_order_id = str(uuid.uuid4())
    data = {
        "id": paper_order_id,
        "run_id": run_id,
        "source_signal_key": source_signal_key,
        "symbol": symbol,
        "direction": direction,
        "requested_qty": requested_qty,
        "confidence_at_entry": confidence_at_entry,
        "risk_pct": risk_pct,
        "sizing_basis": sizing_basis,
        "status": status,
        "rejection_reason": rejection_reason
    }
    db.insert("paper_orders", data)
    print(f"Paper order {paper_order_id} created in Supabase")
    return paper_order_id

def create_paper_trade(
    run_id: str,
    paper_order_id: str,
    symbol: str,
    direction: str,
    qty: int,
    simulation_version: str,
    entry_price: float = None,
    slippage_bps: float = None,
    status: str = "open",
) -> str:
    """Creates a paper trade row and returns paper_trade_id."""
    paper_trade_id = str(uuid.uuid4())
    data = {
        "id": paper_trade_id,
        "paper_order_id": paper_order_id,
        "run_id": run_id,
        "symbol": symbol,
        "direction": direction,
        "qty": qty,
        "status": status,
        "entry_price": entry_price,
        "slippage_bps": slippage_bps,
        "entry_at": datetime.datetime.now(datetime.timezone.utc).isoformat() if entry_price else None,
        "simulation_version": simulation_version
    }
    db.insert("paper_trades", data)
    print(f"Paper trade {paper_trade_id} created in Supabase")
    return paper_trade_id

def close_paper_trade(
    paper_trade_id: str,
    exit_price: float,
    pnl: float,
    exit_reason: str,
):
    """Closes an open paper trade."""
    data = {
        "status": "closed",
        "exit_price": exit_price,
        "exit_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "pnl": pnl,
        "exit_reason": exit_reason
    }
    db.update("paper_trades", {"id": paper_trade_id}, data)
    print(f"Paper trade {paper_trade_id} closed in Supabase")
