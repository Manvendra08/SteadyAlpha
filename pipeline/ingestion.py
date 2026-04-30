"""
pipeline/ingestion.py
Central Ingestion Orchestrator

Responsibilities:
  - Run all adapters in correct order
  - Validate outputs
  - Compute run validity (YES / PARTIAL / NO)
  - Build provenance registry for persistence
  - Gate engines: mark which engines can run READY vs DEGRADED/FAILED
  - Expose DataBundle consumed by pipeline engines
  - Support SANDBOX_MODE (explicit, never accidental)

Non-negotiable rules enforced here:
  1. Random mock data never enters trading path
  2. Run validity computed before engines execute
  3. Every dataset has explicit source_type + freshness
  4. Critical datasets invalidate trading when MISSING
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd

from pipeline.adapters.base import FetchResult
import pipeline.adapters.nifty_ohlcv   as _nifty
import pipeline.adapters.vix           as _vix
import pipeline.adapters.fii_dii       as _fii_dii
import pipeline.adapters.options_chain as _options
import pipeline.adapters.sector_indices as _sector
import pipeline.adapters.universe_ohlcv as _universe
import pipeline.adapters.risk_state    as _risk_state
import pipeline.adapters.delivery      as _delivery

logger = logging.getLogger(__name__)

# ─── Sandbox mode ─────────────────────────────────────────────────────────────
SANDBOX_MODE = os.getenv("STEADYALPHA_SANDBOX_MODE", "false").lower() == "true"

if SANDBOX_MODE:
    logger.warning("=" * 60)
    logger.warning("SANDBOX MODE ACTIVE — run validity always NO for trading")
    logger.warning("All synthetic inputs marked SIMULATED")
    logger.warning("=" * 60)


# ─── Run validity ─────────────────────────────────────────────────────────────

def _compute_run_validity(
    results: Dict[str, FetchResult],
) -> tuple[str, list[str]]:
    """
    Returns (validity, invalid_reasons).
    YES   — all critical datasets trading-valid
    PARTIAL — some noncritical degraded, critical OK
    NO    — any critical dataset missing/invalid/mock
    """
    if SANDBOX_MODE:
        return "NO", ["SANDBOX_MODE active — trading never valid in sandbox"]

    critical_keys = [
        k for k, r in results.items()
        if r.criticality in ("CRITICAL_FOR_DECISION", "CRITICAL_FOR_RISK")
    ]

    invalid_reasons: list[str] = []
    for key in critical_keys:
        r = results[key]
        if not r.trading_valid:
            label = r.source_type if r.source_type != "MISSING" else "MISSING"
            invalid_reasons.append(
                f"Trading invalid: {r.dataset_key} is {label}"
                + (f" — {r.error}" if r.error else "")
            )

    if invalid_reasons:
        return "NO", invalid_reasons

    # Check noncritical degradation
    noncritical_degraded = [
        k for k, r in results.items()
        if r.criticality == "IMPORTANT_NONCRITICAL" and not r.trading_valid
    ]
    if noncritical_degraded:
        reasons = [f"Degraded (noncritical): {k}" for k in noncritical_degraded]
        return "PARTIAL", reasons

    return "YES", []


# ─── Engine gating ─────────────────────────────────────────────────────────────

def _engine_status(
    required_keys: list[str],
    results: Dict[str, FetchResult],
    run_validity: str,
) -> str:
    """
    Determine engine status from its required dataset results.
    READY      — all required datasets trading-valid
    DEGRADED   — some required datasets fallback/cached but not missing
    SIMULATED  — only in SANDBOX_MODE (explicit)
    FAILED     — any required critical dataset MISSING
    WAITING    — no data at all
    """
    if SANDBOX_MODE:
        return "SIMULATED"

    statuses = [results.get(k) for k in required_keys]
    if not any(s for s in statuses):
        return "WAITING"

    missing_critical = [
        s for s in statuses
        if s and not s.success and s.criticality in ("CRITICAL_FOR_DECISION", "CRITICAL_FOR_RISK")
    ]
    if missing_critical:
        return "FAILED"

    all_valid = all(s.trading_valid for s in statuses if s)
    if all_valid:
        return "READY"

    any_missing = any(s.source_type == "MISSING" for s in statuses if s)
    if any_missing:
        return "FAILED"

    return "DEGRADED"


# ─── Data bundle ─────────────────────────────────────────────────────────────

@dataclass
class EngineGates:
    """Per-engine readiness derived from ingestion results."""
    regime:     str = "WAITING"
    flows:      str = "WAITING"
    leadership: str = "WAITING"
    risk:       str = "WAITING"
    decision:   str = "WAITING"


@dataclass
class DataBundle:
    """
    Typed data bundle passed to engines.
    All fields are Optional — engines must check before using.
    Fields are NEVER filled with synthetic random data.
    """
    # Nifty OHLCV
    close:    Optional[pd.Series]    = None
    high:     Optional[pd.Series]    = None
    low:      Optional[pd.Series]    = None
    volume:   Optional[pd.Series]    = None

    # VIX
    vix:      Optional[float]        = None
    vix_series: Optional[pd.Series] = None

    # Breadth (derived from universe OHLCV if available)
    breadth_pct: Optional[float]    = None

    # FII / DII
    fii:      Optional[pd.Series]   = None
    dii:      Optional[pd.Series]   = None

    # PCR / options
    pcr:      Optional[float]       = None
    pcr_series: Optional[pd.Series] = None
    option_chain: Optional[Any]     = None

    # Sectors
    sectors:  Optional[pd.DataFrame] = None

    # Universe (leadership)
    stock_prices: Optional[pd.DataFrame] = None
    stock_volumes: Optional[pd.DataFrame] = None
    universe_symbols: Optional[list]     = None

    # Risk state
    account_equity: Optional[float]      = None
    equity_curve:   Optional[pd.Series]  = None
    positions:      list                 = field(default_factory=list)

    # Provenance
    results:    Dict[str, FetchResult]  = field(default_factory=dict)
    run_validity:  str                  = "NO"
    invalid_reasons: list[str]          = field(default_factory=list)
    engine_gates:   EngineGates         = field(default_factory=EngineGates)
    sandbox_mode:   bool                = SANDBOX_MODE
    fetched_at:     str                 = ""


# ─── Orchestrator ─────────────────────────────────────────────────────────────

class IngestionOrchestrator:
    """
    Runs all adapters, validates, computes run validity,
    and returns a typed DataBundle for engine consumption.
    """

    def run(self) -> DataBundle:
        logger.info("[ingestion] Starting data ingestion run...")
        results: Dict[str, FetchResult] = {}

        # ── 1. Fetch all datasets ──────────────────────────────────────────
        logger.info("[ingestion] Fetching Nifty OHLCV...")
        results["nifty_ohlcv"]    = _nifty.fetch()

        logger.info("[ingestion] Fetching India VIX...")
        results["india_vix"]      = _vix.fetch()

        logger.info("[ingestion] Fetching FII flows...")
        results["fii_flows"]      = _fii_dii.fetch_fii()

        logger.info("[ingestion] Fetching DII flows...")
        results["dii_flows"]      = _fii_dii.fetch_dii()

        logger.info("[ingestion] Fetching PCR OI...")
        results["pcr_oi"]         = _options.fetch_pcr()

        logger.info("[ingestion] Fetching options chain...")
        results["options_chain"]  = _options.fetch_options_chain()

        logger.info("[ingestion] Fetching sector indices...")
        results["sector_indices"] = _sector.fetch()

        logger.info("[ingestion] Fetching universe OHLCV...")
        results["universe_ohlcv"] = _universe.fetch()

        logger.info("[ingestion] Fetching risk/equity state...")
        results["equity_curve"]   = _risk_state.fetch()

        logger.info("[ingestion] Fetching delivery data...")
        results["delivery"]       = _delivery.fetch({})

        # ── 2. Log summary ─────────────────────────────────────────────────
        # Ensure all results are FetchResult objects (prevent NoneType crashes)
        for k in ["nifty_ohlcv", "india_vix", "fii_flows", "dii_flows", "pcr_oi", "options_chain", "sector_indices", "universe_ohlcv", "equity_curve", "delivery"]:
            if results.get(k) is None:
                results[k] = FetchResult.missing(k, "IMPORTANT_NONCRITICAL", "Adapter returned None")

        self._log_summary(results)

        # ── 3. Compute run validity ────────────────────────────────────────
        run_validity, invalid_reasons = _compute_run_validity(results)
        logger.info(f"[ingestion] Run validity: {run_validity}")
        if invalid_reasons:
            for r in invalid_reasons:
                logger.warning(f"[ingestion]   {r}")

        # ── 4. Compute engine gates ────────────────────────────────────────
        gates = EngineGates(
            regime     = _engine_status(["nifty_ohlcv", "india_vix"], results, run_validity),
            flows      = _engine_status(["fii_flows", "pcr_oi"], results, run_validity),
            leadership = _engine_status(["universe_ohlcv", "nifty_ohlcv"], results, run_validity),
            risk       = _engine_status(["equity_curve"], results, run_validity),
            decision   = "SIMULATED" if SANDBOX_MODE else (
                "READY" if run_validity == "YES" else
                "DEGRADED" if run_validity == "PARTIAL" else
                "FAILED"
            ),
        )

        # ── 5. Build DataBundle (no random mocks ever) ────────────────────
        bundle = self._build_bundle(results, run_validity, invalid_reasons, gates)
        return bundle

    def _build_bundle(
        self,
        results: Dict[str, FetchResult],
        run_validity: str,
        invalid_reasons: list[str],
        gates: EngineGates,
    ) -> DataBundle:
        b = DataBundle(
            results         = results,
            run_validity    = run_validity,
            invalid_reasons = invalid_reasons,
            engine_gates    = gates,
            sandbox_mode    = SANDBOX_MODE,
            fetched_at      = datetime.now(timezone.utc).isoformat(),
        )

        # Nifty OHLCV
        r_nifty = results.get("nifty_ohlcv")
        if r_nifty and r_nifty.payload is not None:
            df: pd.DataFrame = r_nifty.payload
            b.close  = df["Close"]
            b.high   = df["High"]
            b.low    = df["Low"]
            b.volume = df["Volume"] if "Volume" in df.columns else None

        # VIX
        r_vix = results.get("india_vix")
        if r_vix and r_vix.payload is not None:
            b.vix        = r_vix.payload.get("vix_latest")
            b.vix_series = r_vix.payload.get("vix_series")

        # FII / DII
        r_fii = results.get("fii_flows")
        if r_fii and r_fii.payload is not None:
            b.fii = r_fii.payload if isinstance(r_fii.payload, pd.Series) else None

        r_dii = results.get("dii_flows")
        if r_dii and r_dii.payload is not None:
            b.dii = r_dii.payload if isinstance(r_dii.payload, pd.Series) else None

        # PCR
        r_pcr = results.get("pcr_oi")
        if r_pcr and r_pcr.payload is not None:
            b.pcr = r_pcr.payload.get("pcr_latest")

        # Options chain
        r_chain = results.get("options_chain")
        if r_chain and r_chain.payload is not None:
            b.option_chain = r_chain.payload

        # Sectors
        r_sec = results.get("sector_indices")
        if r_sec and r_sec.payload is not None:
            b.sectors = r_sec.payload if isinstance(r_sec.payload, pd.DataFrame) else None

        # Universe
        r_uni = results.get("universe_ohlcv")
        if r_uni and r_uni.payload is not None:
            uni_payload = r_uni.payload
            b.stock_prices   = uni_payload.get("close")
            b.stock_volumes  = uni_payload.get("volume")
            b.universe_symbols = uni_payload.get("symbols")

            # Derive breadth from universe if available
            if b.stock_prices is not None and b.close is not None:
                b.breadth_pct = self._derive_breadth(b.stock_prices, b.close)

        # Risk state
        r_eq = results.get("equity_curve")
        if r_eq and r_eq.payload is not None:
            payload = r_eq.payload
            b.account_equity = payload.get("account_equity")
            b.equity_curve   = payload.get("equity_curve")
            b.positions      = []  # positions from trade manager, not ingestion

        return b

    @staticmethod
    def _derive_breadth(stock_prices: pd.DataFrame, benchmark: pd.Series) -> Optional[float]:
        """
        Simple breadth: % stocks above their 20-day MA.
        Derived = valid only if universe is real.
        """
        try:
            ma_window = 20
            if len(stock_prices) < ma_window:
                return None
            ma = stock_prices.rolling(ma_window).mean()
            latest_close = stock_prices.iloc[-1]
            latest_ma    = ma.iloc[-1]
            above = (latest_close > latest_ma).mean()
            return float(above)
        except Exception as exc:
            logger.warning(f"[ingestion] breadth derivation failed: {exc}")
            return None

    @staticmethod
    def _log_summary(results: Dict[str, FetchResult]) -> None:
        logger.info("[ingestion] ─── Dataset Summary ───────────────────")
        for key, r in results.items():
            if r is None:
                logger.warning(f"[ingestion] Dataset {key} is None!")
                continue
            icon = "✓" if r.trading_valid else ("⚠" if r.success else "✗")
            logger.info(
                f"[ingestion] {icon} {key:<22} "
                f"{(r.source_type or '???'):<10} {(r.freshness or '???'):<8} "
                f"valid={r.trading_valid} rows={r.record_count or '—'}"
                + (f" WARN:{r.warning}" if r.warning else "")
                + (f" ERR:{r.error}" if r.error else "")
            )
        logger.info("[ingestion] ─────────────────────────────────────────")


# ─── Provenance dict for persistence ─────────────────────────────────────────

def build_provenance(bundle: DataBundle) -> dict[str, dict]:
    """Serialize provenance for persist.py consumption."""
    provenance = {}
    for key, r in bundle.results.items():
        row = r.to_dict()
        row["run_validity"]       = bundle.run_validity
        row["paper_promo_allowed"] = bundle.run_validity != "NO"
        provenance[key] = row
    return provenance
