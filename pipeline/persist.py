import os
import uuid
import datetime
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
