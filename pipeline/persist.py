import os
import uuid
import datetime
import json
# import supabase (mocked for foundation)

def register_run(trigger_type: str, code_version: str, config_snapshot: dict) -> str:
    """Inserts a new run into run_registry and returns the run_id."""
    run_id = str(uuid.uuid4())
    print(f"Registered run {run_id} (Trigger: {trigger_type}, Code: {code_version})")
    # TODO: Actual Supabase insert
    return run_id

def update_run_status(run_id: str, status: str, error_summary: str = None):
    """Updates the status and completed_at time for a run."""
    print(f"Run {run_id} status updated to: {status}")
    if error_summary:
        print(f"Error summary: {error_summary}")
    # TODO: Actual Supabase update

def update_health(pipeline_id: str, run_id: str, status: str):
    """Updates the pipeline_health table."""
    print(f"Pipeline {pipeline_id} health updated to: {status}")
    # TODO: Actual Supabase upsert


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
    print(
        f"Paper order {paper_order_id} created "
        f"(run={run_id}, signal={source_signal_key}, {symbol} {direction}, "
        f"qty={requested_qty}, status={status})"
    )
    print(
        f"Paper order explainability: confidence={confidence_at_entry}, "
        f"risk_pct={risk_pct}, sizing_basis={json.dumps(sizing_basis)}"
    )
    if rejection_reason:
        print(f"Paper order rejection reason: {rejection_reason}")
    # TODO: Actual Supabase insert
    return paper_order_id


def mark_paper_order_status(
    paper_order_id: str,
    status: str,
    rejection_reason: str = None,
):
    """Updates paper order lifecycle status."""
    print(f"Paper order {paper_order_id} status updated to: {status}")
    if rejection_reason:
        print(f"Paper order rejection reason: {rejection_reason}")
    # TODO: Actual Supabase update


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
    print(
        f"Paper trade {paper_trade_id} created "
        f"(run={run_id}, order={paper_order_id}, {symbol} {direction}, "
        f"qty={qty}, status={status}, sim={simulation_version})"
    )
    if entry_price is not None:
        print(f"Paper trade entry: price={entry_price}, slippage_bps={slippage_bps}")
    # TODO: Actual Supabase insert
    return paper_trade_id


def close_paper_trade(
    paper_trade_id: str,
    exit_price: float,
    pnl: float,
    exit_reason: str,
):
    """Closes an open paper trade."""
    print(
        f"Paper trade {paper_trade_id} closed "
        f"(exit_price={exit_price}, pnl={pnl}, reason={exit_reason})"
    )
    # TODO: Actual Supabase update
