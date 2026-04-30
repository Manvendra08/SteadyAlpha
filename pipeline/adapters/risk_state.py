"""
pipeline/adapters/risk_state.py
Equity curve + drawdown state source ladder:
  1. Supabase paper_trades ledger (REAL)
  2. Broker-derived state (FALLBACK placeholder — future live integration)
  3. MISSING — no synthetic equity permitted in trading path

Criticality: CRITICAL_FOR_RISK
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, now_iso

logger = logging.getLogger(__name__)

DATASET_KEY   = "equity_curve"
CRITICALITY   = "CRITICAL_FOR_RISK"
REFERENCE_CAP = float(os.getenv("REFERENCE_CAPITAL", "1000000"))  # config fallback


def fetch() -> FetchResult:
    """Equity / drawdown source ladder."""

    # ── Rung 1: Supabase paper_trades ledger (Primary) ───────────────────
    result = _try_supabase()
    if result and result.success:
        return result

    logger.warning("[risk_state] Supabase ledger failed.")

    # ── Rung 2: Dhan (Deactivated) ────────────────────────────────────
    # result = _try_dhan()
    # if result and result.success:
    #     return result

    # ── Rung 3: MISSING — do NOT synthesize equity ────────────────────────
    return FetchResult.missing(
        DATASET_KEY, CRITICALITY,
        "Equity/drawdown state unavailable — risk engine cannot gate execution",
    )


def _try_dhan() -> Optional[FetchResult]:
    """Rung 2: Dhan primary."""
    try:
        from pipeline.adapters.dhan_market import get_account_equity
        cash = get_account_equity()
        if cash is None:
            return None

        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return FetchResult(
            dataset_key   = DATASET_KEY,
            provider      = "dhan",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = 1,
            payload       = {
                "account_equity": cash,
                "equity_curve":   pd.Series([cash]),
                "max_drawdown":   0.0,
                "trade_count":    0,
            },
            warning = "Using Dhan cash limit as account equity — drawdown history unavailable",
        )
    except Exception as exc:
        logger.warning(f"[risk_state/dhan] exception: {exc}")
        return None


def _try_supabase() -> Optional[FetchResult]:
    """
    Query paper_trades table to derive equity curve and current drawdown state.
    Returns REAL if trades found, MISSING if table unreachable.
    """
    try:
        from pipeline.persist import PersistenceManager  # type: ignore

        pm = PersistenceManager()
        client = pm.supabase

        # Fetch closed trades ordered by exit_at
        resp = (
            client.table("paper_trades")
            .select("entry_price,exit_price,qty,direction,exit_at,status")
            .in_("status", ["closed", "stopped"])
            .order("exit_at", desc=False)
            .execute()
        )

        trades = resp.data if resp and resp.data else []

        # Reconstruct equity curve from trade P&L
        equity = REFERENCE_CAP
        equity_series = [equity]
        timestamps    = []

        for t in trades:
            try:
                entry = float(t.get("entry_price", 0) or 0)
                exit_ = float(t.get("exit_price", 0) or 0)
                qty   = float(t.get("qty", 0) or 0)
                dirn  = t.get("direction", "LONG")

                pnl = (exit_ - entry) * qty if dirn == "LONG" else (entry - exit_) * qty
                equity += pnl
                equity_series.append(equity)
                timestamps.append(t.get("exit_at", ""))
            except Exception:
                continue

        # Compute peak drawdown
        eq_s    = pd.Series(equity_series)
        peak    = eq_s.cummax()
        dd      = (eq_s - peak) / peak
        max_dd  = float(dd.min()) if not dd.empty else 0.0

        record_count = len(trades)
        market_date  = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        return FetchResult(
            dataset_key   = DATASET_KEY,
            provider      = "supabase_paper_trades",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = record_count,
            payload       = {
                "account_equity": equity,
                "equity_curve":   eq_s,
                "max_drawdown":   max_dd,
                "trade_count":    record_count,
            },
            warning = None if record_count > 0 else "No closed trades found — equity at reference capital",
        )

    except (ValueError, ImportError) as exc:
        logger.warning(f"[risk_state] Supabase not configured: {exc}")
        return None
    except Exception as exc:
        logger.error(f"[risk_state] Supabase query failed: {exc}")
        return None
