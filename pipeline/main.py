"""
SteadyAlpha Pipeline — Main entry point.

Orchestrates:
  1. Config snapshot capture
  2. Run registration
  3. Data validation
  4. Engine execution (Regime → Flows → Leadership)
  5. Signal aggregation to signals_summary
  6. Engine audit logging
"""

import os
import yaml
import json
from pathlib import Path
from dataclasses import asdict

from persist import (
    register_run,
    update_run_status,
    update_health,
    create_paper_order,
    create_paper_trade,
    log_engine_audit,
    upsert_signals_summary,
)
from validate import validate_freshness, compute_digest, DataHealth
from engines.regime import compute_regime, RegimeState
from engines.flows import compute_flows
from engines.leadership import rank_universe
from engines.advisor import compute_advice
from engines.promotion import evaluate_promotion


def load_config_snapshot() -> dict:
    """Read all config/ files and return as a single serializable dict."""
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


def run_engines(config: dict) -> dict:
    """
    Execute all engines and return aggregated signals_summary dict.

    In production, engine inputs come from data sources.
    Currently uses placeholder data for structural validation.
    """
    # --- Regime Engine ---
    regime_result = compute_regime(
        current_score=0.6,  # placeholder
        previous_state=RegimeState.RANGE,
        consecutive_days_above=0,
        consecutive_days_below=0,
    )

    # --- Flows Engine ---
    flows_result = compute_flows(
        fii_net=1200.0,     # placeholder crore
        dii_net=-400.0,
        current_pcr=1.15,
        historical_pcr=[0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.05, 0.95],
        sector_prices={},   # placeholder
        benchmark_prices=[], 
    )

    # --- Leadership Engine ---
    leaders = rank_universe(
        universe={},         # placeholder — will be wired to data sources
        benchmark_prices=[],
        window=20,
    )

    top_leaders = [asdict(s) for s in leaders[:10]] if leaders else []
    top_laggards = [asdict(s) for s in leaders[-5:]] if leaders else []

    return {
        "regime_state": regime_result.state.value,
        "regime_score": regime_result.score,
        "regime_changed": regime_result.changed,
        "flows_bias": flows_result.overall_bias,
        "fii_net": flows_result.fii_net,
        "dii_net": flows_result.dii_net,
        "pcr_value": flows_result.pcr_value,
        "pcr_percentile": flows_result.pcr_percentile,
        "top_leaders": top_leaders,
        "top_laggards": top_laggards,
    }


def main():
    trigger_type = os.environ.get("TRIGGER_TYPE", "scheduled")
    code_version = os.environ.get("CODE_VERSION", "unknown")

    config_snapshot = load_config_snapshot()

    run_id = register_run(
        trigger_type=trigger_type,
        code_version=code_version,
        config_snapshot=config_snapshot,
    )

    try:
        signals = run_engines(config_snapshot)

        default_cfg = config_snapshot.get("default.yaml", {})
        risk_cfg = default_cfg.get("risk", {})
        paper_cfg = default_cfg.get("paper_execution", {})

        advisor = compute_advice(
            regime_state=signals["regime_state"],
            regime_changed=signals["regime_changed"],
            flows_bias=signals["flows_bias"],
            pcr_percentile=signals["pcr_percentile"],
        )

        symbol = paper_cfg.get("default_symbol", "NIFTY")
        risk_halt = False
        risk_pct = float(risk_cfg.get("base_risk_pct", 0.75))

        promotion = evaluate_promotion(
            regime_state=signals["regime_state"],
            recommendation=advisor.recommendation,
            confidence=advisor.confidence,
            risk_halt=risk_halt,
            risk_pct=risk_pct,
            paper_config=paper_cfg,
        )

        direction = advisor.recommendation if advisor.recommendation in ("LONG", "SHORT") else "LONG"
        paper_order_id = create_paper_order(
            run_id=run_id,
            source_signal_key=f"{run_id}:advisor",
            symbol=symbol,
            direction=direction,
            requested_qty=promotion.requested_qty,
            confidence_at_entry=advisor.confidence,
            risk_pct=promotion.risk_pct,
            sizing_basis=promotion.sizing_basis,
            status=promotion.status,
            rejection_reason=promotion.rejection_reason,
        )

        if promotion.status == "pending":
            create_paper_trade(
                run_id=run_id,
                paper_order_id=paper_order_id,
                symbol=symbol,
                direction=direction,
                qty=promotion.requested_qty,
                simulation_version=paper_cfg.get("simulation_version", "v1"),
                entry_price=float(paper_cfg.get("assumed_entry_price", 100.0)),
                slippage_bps=float(paper_cfg.get("default_slippage_bps", 5.0)),
                status="open",
            )

        print(
            "Promotion decision: "
            f"status={promotion.status}, "
            f"reason={promotion.rejection_reason}, "
            f"qty={promotion.requested_qty}"
        )

        # Log engine audit digests
        input_digest = compute_digest(config_snapshot)
        output_digest = compute_digest(signals)
        log_engine_audit(run_id, input_digest, output_digest, signals)
        print(f"Engine audit: input={input_digest}, output={output_digest}")

        # Log signals summary
        upsert_signals_summary(run_id, signals)
        print(f"Signals summary: {json.dumps(signals, indent=2)}")

        update_run_status(run_id, "success")
        update_health("main_pipeline", run_id, "healthy")

    except Exception as e:
        update_run_status(run_id, "failed", str(e))
        update_health("main_pipeline", run_id, "failing")
        raise


if __name__ == "__main__":
    main()
