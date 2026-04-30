"""
pipeline/adapters/sector_indices.py
Sector indices source ladder:
  1. Research360 /api/market/indian-indices (PRIMARY — no broker auth needed)
  2. yfinance batch (REAL fallback)
  3. Disk cache (CACHED)
  4. MISSING
Criticality: IMPORTANT_NONCRITICAL

FUTURE (pending static IP):
  Rung 0: Dhan primary — blocked (dynamic IP)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

DATASET_KEY = "sector_indices"
CRITICALITY = "IMPORTANT_NONCRITICAL"
LOOKBACK_DAYS = 60
MIN_ROWS = 10

# NSE sector index symbols on Yahoo Finance
SECTOR_SYMBOLS: dict[str, str] = {
    "NIFTY_IT":    "^CNXIT",
    "NIFTY_BANK":  "^NSEBANK",
    "NIFTY_PHARMA":"^CNXPHARMA",
    "NIFTY_AUTO":  "^CNXAUTO",
    "NIFTY_FMCG":  "^CNXFMCG",
    "NIFTY_METAL": "^CNXMETAL",
}


def fetch() -> FetchResult:
    """Sector indices source ladder."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=LOOKBACK_DAYS)

    # ── Rung 1: Research360 (primary — no broker IP lock) ─────────────────
    result = _try_research360()
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 2: yfinance ──────────────────────────────────────────────────
    result = _try_yfinance(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 3: disk cache ────────────────────────────────────────────────
    cached = _try_cache()
    if cached and cached.success:
        return cached

    # ── Rung 4: MISSING ───────────────────────────────────────────────────
    return FetchResult.missing(DATASET_KEY, CRITICALITY, "Sector indices: all sources failed")


def _try_research360() -> Optional[FetchResult]:
    """Rung 1: Research360 public API — Sector Indices LTP."""
    try:
        from pipeline.adapters.research360 import get_nse_indices
        indices = get_nse_indices()
        if not indices:
            return None

        # Build DataFrame matching expected schema
        # Expected: Index as symbol (NSE symbol), Columns: LTP, etc.
        # Actually, sector_indices.py usually returns a series or df with symbols as columns.
        import pandas as pd
        
        # Map R360 names to Yahoo Finance symbols for consistency with existing pipeline expectations
        # R360 returns index_name like "Nifty IT", "Nifty Bank"
        NAME_MAP = {
            "NIFTY IT":    "NIFTY_IT",
            "NIFTY BANK":  "NIFTY_BANK",
            "NIFTY PHARMA":"NIFTY_PHARMA",
            "NIFTY AUTO":  "NIFTY_AUTO",
            "NIFTY FMCG":  "NIFTY_FMCG",
            "NIFTY METAL": "NIFTY_METAL",
        }

        row = {}
        for item in indices:
            name = item["index_name"].upper()
            if name in NAME_MAP:
                row[NAME_MAP[name]] = item["ltp"]
        
        if not row:
            return None

        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        df = pd.DataFrame([row], index=pd.to_datetime([market_date]))
        
        return FetchResult(
            dataset_key   = DATASET_KEY,
            provider      = "research360",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = len(df),
            payload       = df,
        )
    except Exception as exc:
        logger.warning(f"[sector/r360] exception: {exc}")
        return None


# FUTURE: Dhan primary (pending static IP)
def _try_shoonya(lookback_days: int) -> Optional[FetchResult]: # noqa: ARG001
    """FUTURE Rung — Dhan (blocked: no static IP). Returns None always."""
    return None


@with_retry(max_attempts=2, base_delay=1.5)
def _fetch_yfinance_raw(symbols: list[str], start: str, end: str) -> pd.DataFrame:
    import yfinance as yf
    df = yf.download(symbols, start=start, end=end, progress=False, auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df = df["Close"]
    return df


def _try_yfinance(start: str, end: str) -> Optional[FetchResult]:
    try:
        symbols = list(SECTOR_SYMBOLS.values())
        df = _fetch_yfinance_raw(symbols, start, end)

        if df is None or df.empty:
            return None

        df = df.dropna(how="all")
        if len(df) < MIN_ROWS:
            logger.warning(f"[sector] yfinance: only {len(df)} rows")
            return None

        coverage = df.notna().mean()
        min_coverage = coverage.min()
        if min_coverage < 0.3:
            logger.warning(f"[sector] low data coverage: {min_coverage:.0%}")

        market_date = df.index[-1].strftime("%Y-%m-%d")
        return FetchResult(
            dataset_key   = DATASET_KEY,
            provider      = "yfinance",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = len(df),
            payload       = df,
            warning       = None if min_coverage > 0.8 else f"Partial sector coverage: {min_coverage:.0%}",
        )
    except Exception as exc:
        logger.error(f"[sector] yfinance exception: {exc}")
        return None


def _try_cache() -> Optional[FetchResult]:
    meta = cache_read_meta(DATASET_KEY)
    if not meta:
        return None
    logger.warning("[sector] Using CACHED sector snapshot")
    return FetchResult(
        dataset_key   = DATASET_KEY,
        provider      = "cache",
        source_type   = "CACHED",
        freshness     = "STALE",
        criticality   = CRITICALITY,
        success       = True,
        trading_valid = False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,
        warning       = "Stale sector cache",
    )
