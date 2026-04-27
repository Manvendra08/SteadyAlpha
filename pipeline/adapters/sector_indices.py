"""
pipeline/adapters/sector_indices.py
Sector indices source ladder:
  1. yfinance batch (REAL)
  2. Disk cache (CACHED)
  3. MISSING
Criticality: IMPORTANT_NONCRITICAL
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

    result = _try_yfinance(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    cached = _try_cache()
    if cached and cached.success:
        return cached

    return FetchResult.missing(DATASET_KEY, CRITICALITY, "Sector indices: all sources failed")


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
