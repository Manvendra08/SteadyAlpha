import os
import yaml
import json
from pathlib import Path
from persist import register_run, update_run_status, update_health

def load_config_snapshot() -> dict:
    """Read all config/ files at runtime and return as a single serializable dict."""
    config_dir = Path("config")
    snapshot = {}
    if not config_dir.exists():
        return snapshot
    for f in config_dir.iterdir():
        if f.suffix in (".yaml", ".yml"):
            with open(f, "r") as file:
                snapshot[f.name] = yaml.safe_load(file)
        elif f.suffix == ".json":
            with open(f, "r") as file:
                snapshot[f.name] = json.load(file)
    return snapshot

def main():
    trigger_type = os.environ.get("TRIGGER_TYPE", "scheduled")
    code_version = os.environ.get("CODE_VERSION", "unknown")
    
    config_snapshot = load_config_snapshot()
    
    run_id = register_run(
        trigger_type=trigger_type,
        code_version=code_version,
        config_snapshot=config_snapshot
    )
    
    try:
        # TODO: Execute engines
        print("Executing engines...")
        
        update_run_status(run_id, "success")
        update_health("main_pipeline", run_id, "healthy")
    except Exception as e:
        update_run_status(run_id, "failed", str(e))
        update_health("main_pipeline", run_id, "failing")
        raise

if __name__ == "__main__":
    main()
