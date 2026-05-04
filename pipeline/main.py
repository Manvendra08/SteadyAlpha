"""
SteadyAlpha Main Pipeline
Orchestrates Engine Execution and Persistence

Responsibilities:
1. Run ingestion orchestrator (real data, source ladder, provenance).
2. Initialize engines.
3. Execute engines gated on run validity.
4. Persist results + provenance to database.
5. Handle errors and logging.
"""

import logging
import sys
from pathlib import Path

# Add project root to sys.path for absolute imports
root = Path(__file__).resolve().parent.parent
if str(root) not in sys.path:
    sys.path.append(str(root))

import yaml
import pandas as pd
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import uuid
import time
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Load environment variables from .env
load_dotenv()

# Engine Imports
from pipeline.engines.regime import RegimeEngine
from pipeline.engines.flows import FlowsEngine
from pipeline.engines.leadership import LeadershipEngine
from pipeline.engines.risk import RiskEngine
from pipeline.engines.options import OptionsEngine
from pipeline.engines.advisor import Advisor
from pipeline.engines.promotion import evaluate_promotion
from pipeline.engines.trade_manager import TradeManager
from pipeline.notifier import Notifier

# Persistence + Ingestion
from pipeline.persist import PersistenceManager
from pipeline.ingestion import IngestionOrchestrator, build_provenance

class SteadyAlphaPipeline:
    def __init__(self, config_path: str = "config/default.yaml"):
        self.config_path = config_path
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
            
        # Initialize Engines
        self.regime_engine = RegimeEngine(config_path)
        self.flows_engine = FlowsEngine(config_path)
        self.leadership_engine = LeadershipEngine(config_path)
        self.risk_engine = RiskEngine(config_path)
        self.options_engine = OptionsEngine(config_path)
        self.advisor = Advisor(config_path)
        
        # Initialize Persistence
        try:
            self.db = PersistenceManager()
            self.trade_manager = TradeManager(self.db)
        except ValueError as e:
            print(f"Warning: DB not configured. Persistence disabled. ({e})")
            self.db = None
            self.trade_manager = None
            
        self.notifier = Notifier()
        
        print("SteadyAlpha Pipeline Initialized.")

    def ingest(self):
        """
        Run ingestion orchestrator.
        Returns a DataBundle with real data, provenance, and run validity.
        No random mock data.
        """
        orchestrator = IngestionOrchestrator()
        bundle = orchestrator.run()

        logger.info(
            f"Ingestion complete | validity={bundle.run_validity} | "
            f"sandbox={bundle.sandbox_mode}"
        )
        if bundle.invalid_reasons:
            for reason in bundle.invalid_reasons:
                logger.warning(f"  {reason}")

        return bundle

    def run(self) -> Dict[str, Any]:
        """Execute pipeline with real data ingestion and engine gating."""
        start_time = time.time()
        run_id     = str(uuid.uuid4())
        timestamp  = datetime.now(timezone.utc)

        logger.info(f"Starting Run: {run_id}")

        try:
            # ── 1. Ingest real data ────────────────────────────────────────
            bundle = self.ingest()
            gates  = bundle.engine_gates

            # ── 2. Regime ─────────────────────────────────────────────────
            logger.info(f"Regime engine gate: {gates.regime}")
            if gates.regime not in ("READY", "DEGRADED") or bundle.close is None:
                logger.warning("Regime engine skipped — insufficient data")
                regime_state = {
                    "state": "UNKNOWN", "trend_score": 0.0,
                    "engine_status": gates.regime, "trading_valid": False,
                }
            else:
                # Previous regime from Supabase (or UNKNOWN if first run)
                prev_state_dict = self.db.get_latest_regime_state() if self.db else {"state": "UNKNOWN", "days_in_state": 0}
                prev_state = prev_state_dict.get("state", "UNKNOWN")
                days_in_state = prev_state_dict.get("days_in_state", 0)

                regime_state = self.regime_engine.run(
                    high           = bundle.high,
                    low            = bundle.low,
                    close          = bundle.close,
                    vix            = bundle.vix if bundle.vix is not None else None,
                    breadth_pct    = bundle.breadth_pct if bundle.breadth_pct is not None else None,
                    previous_state = prev_state,
                    days_in_state  = days_in_state,
                )
                regime_state["engine_status"] = gates.regime

            # ── 3. Flows ──────────────────────────────────────────────────
            logger.info(f"Flows engine gate: {gates.flows}")
            if gates.flows not in ("READY", "DEGRADED") or bundle.fii is None:
                logger.warning("Flows engine skipped — FII/PCR unavailable")
                flows_state = {
                    "flows_score": 0.0, "engine_status": gates.flows,
                    "trading_valid": False,
                }
            else:
                flows_state = self.flows_engine.run(
                    fii_flows    = bundle.fii,
                    dii_flows    = bundle.dii,
                    pcr_data     = bundle.pcr_series,
                    sector_prices= bundle.sectors,
                    max_pain     = bundle.max_pain,
                    spot_price   = bundle.spot_price,
                    pcr_latest   = bundle.pcr,
                )
                flows_state["engine_status"] = gates.flows

            # ── 4. Leadership ─────────────────────────────────────────────
            logger.info(f"Leadership engine gate: {gates.leadership}")
            if gates.leadership not in ("READY", "DEGRADED") or bundle.stock_prices is None:
                logger.warning("Leadership engine skipped — universe OHLCV unavailable")
                leadership_state = {
                    "leaders_count": 0, "engine_status": gates.leadership,
                    "trading_valid": False,
                }
            else:
                leadership_state = self.leadership_engine.run(
                    stock_prices     = bundle.stock_prices,
                    volume_data      = bundle.stock_volumes,
                    benchmark_prices = bundle.close,
                )
                leadership_state["engine_status"] = gates.leadership

            # ── 5. Risk ───────────────────────────────────────────────────
            logger.info(f"Risk engine gate: {gates.risk}")
            if gates.risk not in ("READY", "DEGRADED") or bundle.account_equity is None:
                logger.warning("Risk engine skipped — equity state unavailable")
                risk_state = {
                    "status": "FAILED", "engine_status": gates.risk,
                    "trading_valid": False,
                    "circuit_breaker": {"active": False},
                    "limits": {"base_risk_pct": 0.0, "daily_drawdown_limit_pct": 6.0},
                    "portfolio_risk": {},
                }
            else:
                risk_state = self.risk_engine.run(
                    account_equity    = bundle.account_equity,
                    current_positions = bundle.positions,
                    equity_curve      = bundle.equity_curve,
                )
                risk_state["engine_status"] = gates.risk

            # ── 6. Options ────────────────────────────────────────────────
            if bundle.close is not None and bundle.option_chain is not None:
                options_state = self.options_engine.run(
                    spot_price      = float(bundle.close.iloc[-1]),
                    iv_series       = bundle.vix_series,
                    option_chain    = bundle.option_chain,
                    pcr_oi_series   = None,  # real PCR scalar used instead
                )
            else:
                options_state = {"status": "SKIPPED", "trading_valid": False}

            # ── 7. Advisor ────────────────────────────────────────────────
            logger.info(f"Decision gate: {gates.decision}")
            
            # Determine Mode (PAPER, ASSISTED_LIVE, LIVE_AUTO)
            # Default to PAPER for now as per Relaxation Spec
            mode = self.config.get('advisor', {}).get('mode', 'PAPER')
            
            advisor_state = self.advisor.run(
                regime_state    = regime_state,
                flows_state     = flows_state,
                leadership_state= leadership_state,
                risk_state      = risk_state,
                mode            = mode,
                run_validity    = bundle.run_validity,  # Paper Trade Generation Tuning v0.7.1
            )

            # Override label if run is not trading-valid
            if bundle.run_validity == "NO":
                advisor_state["action"]         = "INVALID_FOR_TRADING"
                advisor_state["trading_valid"]  = False
                advisor_state["invalid_reasons"]= bundle.invalid_reasons

            advisor_state["engine_status"]  = gates.decision
            advisor_state["run_validity"]   = bundle.run_validity
            advisor_state["sandbox_mode"]   = bundle.sandbox_mode

            # ── 8. Promotion (blocked if run_validity=NO) ─────────────────
            paper_orders: list = []
            paper_trades: list = []

            if bundle.run_validity == "NO":
                logger.warning("Paper promotion DISABLED — run validity NO")
            elif advisor_state["action"] in ("LONG", "SHORT"):
                paper_config = self.config.get("paper_execution", {})
                promotion = evaluate_promotion(
                    regime_state    = regime_state.get("state", "UNKNOWN"),
                    recommendation  = advisor_state["action"],
                    confidence      = advisor_state["confidence"],
                    risk_halt       = risk_state["status"] == "HALTED",
                    risk_pct        = risk_state["limits"]["base_risk_pct"],
                    paper_config    = paper_config,
                )
                order = {
                    "symbol":               "NIFTY",
                    "direction":            advisor_state["action"],
                    "status":               promotion.status,
                    "requested_qty":        promotion.requested_qty,
                    "confidence_at_entry":  advisor_state["confidence"],
                    "risk_pct":             promotion.risk_pct,
                    "sizing_basis":         promotion.sizing_basis,
                    "rejection_reason":     promotion.rejection_reason,
                    "source_signal_key":    f"{run_id}:advisor",
                }
                paper_orders.append(order)
                if promotion.status == "pending" and bundle.close is not None:
                    paper_trades.append({
                        "symbol":             "NIFTY",
                        "direction":          advisor_state["action"],
                        "qty":                promotion.requested_qty,
                        "entry_price":        float(bundle.close.iloc[-1]),
                        "entry_at":           timestamp.isoformat(),
                        "simulation_version": "v0.7.0",
                    })

            # ── 9. Consolidate results + provenance ───────────────────────
            provenance = build_provenance(bundle)
            
            # Build raw data previews for v0.7.0 Evidence Drawer
            raw_data_previews = []
            if bundle.close is not None:
                df_tail = bundle.close.to_frame("Close").tail(5).reset_index()
                df_tail.columns = ["Date", "Close"]
                raw_data_previews.append({
                    "label": "Nifty OHLCV (Tail)",
                    "provider": bundle.results.get("nifty_ohlcv").provider if "nifty_ohlcv" in bundle.results else "unknown",
                    "fetchedAt": bundle.results.get("nifty_ohlcv").fetched_at if "nifty_ohlcv" in bundle.results else None,
                    "marketDate": bundle.results.get("nifty_ohlcv").market_date if "nifty_ohlcv" in bundle.results else None,
                    "recordCount": bundle.results.get("nifty_ohlcv").record_count if "nifty_ohlcv" in bundle.results else None,
                    "rows": df_tail.to_dict("records"),
                    "usedInRun": bundle.engine_gates.regime in ("READY", "DEGRADED")
                })
            
            if bundle.fii is not None:
                df_fii = bundle.fii.to_frame("NetValue").tail(3).reset_index()
                df_fii.columns = ["Date", "NetValue"]
                raw_data_previews.append({
                    "label": "FII Flows (Tail)",
                    "provider": bundle.results.get("fii_flows").provider if "fii_flows" in bundle.results else "unknown",
                    "fetchedAt": bundle.results.get("fii_flows").fetched_at if "fii_flows" in bundle.results else None,
                    "marketDate": bundle.results.get("fii_flows").market_date if "fii_flows" in bundle.results else None,
                    "recordCount": bundle.results.get("fii_flows").record_count if "fii_flows" in bundle.results else None,
                    "rows": df_fii.to_dict("records"),
                    "usedInRun": bundle.engine_gates.flows in ("READY", "DEGRADED")
                })

            results = {
                "run_id":         run_id,
                "timestamp":      timestamp,
                "run_validity":   bundle.run_validity,
                "invalid_reasons":bundle.invalid_reasons,
                "sandbox_mode":   bundle.sandbox_mode,
                "provenance":     provenance,
                "raw_data_previews": raw_data_previews,
                "regime":         regime_state,
                "flows":          flows_state,
                "leadership":     leadership_state,
                "risk":           risk_state,
                "options":        options_state,
                "advisor":        advisor_state,
                "paper_orders":   paper_orders,
                "paper_trades":   paper_trades,
                "paper_promotion_allowed": bundle.run_validity != "NO",
            }

            # ── 10. Persist ───────────────────────────────────────────────
            duration_ms = int((time.time() - start_time) * 1000)
            if self.db:
                self.db.persist_full_run(results, duration_ms)
                if bundle.close is not None:
                    logger.info("Running Trade Management Loop...")
                    self.trade_manager.evaluate_open_trades(
                        current_price = float(bundle.close.iloc[-1]),
                        current_date  = timestamp.isoformat(),
                    )
            else:
                logger.warning("Persistence skipped (DB not configured).")

            duration = time.time() - start_time
            logger.info(f"Run Completed in {duration:.2f}s | action={advisor_state['action']} | validity={bundle.run_validity}")

            # ── 11. Alerts ────────────────────────────────────────────────
            self.notifier.alert_run_results(results)

            return results

        except Exception as exc:
            logger.exception(f"Pipeline Failed: {exc}")
            return {"status": "failed", "error": str(exc)}

if __name__ == "__main__":
    pipeline = SteadyAlphaPipeline()
    results = pipeline.run()
