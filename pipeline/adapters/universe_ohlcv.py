"""
pipeline/adapters/universe_ohlcv.py
F&O 200 universe OHLCV source ladder:
  1. Shoonya primary (PRIMARY)
  2. yfinance batched symbol fetch (REAL fallback)
  3. NSE bhavcopy batch (FALLBACK placeholder)
  4. Per-symbol cached history (CACHED)
  5. MISSING if coverage < threshold

Criticality: CRITICAL_FOR_DECISION
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

DATASET_KEY   = "universe_ohlcv"
CRITICALITY   = "CRITICAL_FOR_DECISION"
LOOKBACK_DAYS = 120
MIN_COVERAGE  = 0.50   # at least 50% of symbols must have data
MIN_ROWS      = 20

# In production this comes from a universe file / Supabase table.
# Placeholder: expand to full F&O 200 when universe management is wired.
DEFAULT_UNIVERSE_FILE = os.path.join("config", "fo200_symbols.txt")
FALLBACK_SYMBOLS = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS", "WIPRO.NS",
]


def _load_universe() -> list[str]:
    """Load symbol list. Prefer config file; fall back to hardcoded small list."""
    if os.path.exists(DEFAULT_UNIVERSE_FILE):
        with open(DEFAULT_UNIVERSE_FILE) as f:
            syms = [l.strip() for l in f if l.strip() and not l.startswith("#")]
        if syms:
            logger.info(f"[universe] Loaded {len(syms)} symbols from {DEFAULT_UNIVERSE_FILE}")
            return syms
    logger.warning(f"[universe] {DEFAULT_UNIVERSE_FILE} not found. Using {len(FALLBACK_SYMBOLS)}-symbol placeholder.")
    return FALLBACK_SYMBOLS


def fetch() -> FetchResult:
    """Universe OHLCV source ladder."""
    symbols = _load_universe()
    end     = datetime.now(timezone.utc)
    start   = end - timedelta(days=LOOKBACK_DAYS)

    # ── Rung 1: yfinance (Primary for Phase 1) ────────────────────────────
    result = _try_yfinance(symbols, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 2: Shoonya/Dhan (Deactivated) ────────────────────────────────
    # result = _try_shoonya(symbols, LOOKBACK_DAYS)
    # ...


    # ── Rung 3: NSE bhavcopy batch not yet implemented. ────────
    logger.warning("[universe] yfinance failed. NSE bhavcopy batch not yet implemented.")

    cached = _try_cache()
    if cached and cached.success:
        return cached

    return FetchResult.missing(
        DATASET_KEY, CRITICALITY,
        f"Universe OHLCV: all sources failed for {len(symbols)} symbols",
    )


def _try_shoonya(symbols: list[str], lookback_days: int) -> Optional[FetchResult]:
    """Rung 1: Dhan primary."""
    try:
        from pipeline.adapters.dhan_market import get_universe_ohlcv
        # Strip .NS for Dhan (adjust if Dhan needs different symbols)
        dhan_syms = [s.replace(".NS", "") for s in symbols]
        
        df = get_universe_ohlcv(dhan_syms, lookback_days)
        if df is None or df.empty:
            return None

        df = df.dropna(how="all")
        if len(df) < MIN_ROWS:
            return None

        # Coverage check
        coverage = df.notna().any().mean()
        if coverage < MIN_COVERAGE:
            logger.warning(f"[universe/dhan] coverage {coverage:.0%} < {MIN_COVERAGE:.0%}")
            return None

        market_date = df.index[-1].strftime("%Y-%m-%d")
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
            record_count  = int(df.notna().any().sum()),
            payload       = {"close": df, "volume": None, "symbols": symbols}, # Volume omitted in universe batch for now
            warning       = None if coverage > 0.8 else f"Partial Dhan universe: {coverage:.0%}",
        )
    except Exception as exc:
        logger.warning(f"[universe/dhan] exception: {exc}")
        return None


@with_retry(max_attempts=2, base_delay=2.0)
def _fetch_yfinance_raw(symbols: list[str], start: str, end: str) -> pd.DataFrame:
    import yfinance as yf
    # Download in batch; yfinance returns MultiIndex cols for multiple symbols
    df = yf.download(symbols, start=start, end=end, progress=False, auto_adjust=True, group_by="ticker")
    return df


def _try_yfinance(symbols: list[str], start: str, end: str) -> Optional[FetchResult]:
    try:
        raw = _fetch_yfinance_raw(symbols, start, end)
        if raw is None or raw.empty:
            return None

        # Extract Close prices per symbol
        if isinstance(raw.columns, pd.MultiIndex):
            close_df = raw.xs("Close", axis=1, level=1, drop_level=True)
        else:
            close_df = raw[["Close"]] if "Close" in raw.columns else raw

        close_df = close_df.dropna(how="all")
        if len(close_df) < MIN_ROWS:
            logger.warning(f"[universe] yfinance: only {len(close_df)} rows")
            return None

        # Coverage check
        coverage = close_df.notna().any().mean()
        if coverage < MIN_COVERAGE:
            logger.warning(f"[universe] yfinance: coverage {coverage:.0%} < {MIN_COVERAGE:.0%}")
            return None

        warning = None
        if coverage < 0.8:
            warning = f"Partial universe coverage: {coverage:.0%} of {len(symbols)} symbols"
            logger.warning(f"[universe] {warning}")

        # Also extract Volume
        if isinstance(raw.columns, pd.MultiIndex):
            vol_df = raw.xs("Volume", axis=1, level=1, drop_level=True)
        else:
            vol_df = pd.DataFrame(index=close_df.index)

        market_date = close_df.index[-1].strftime("%Y-%m-%d")
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
            record_count  = int(close_df.notna().any().sum()),  # symbols with data
            payload       = {"close": close_df, "volume": vol_df, "symbols": symbols},
            warning       = warning,
        )
    except Exception as exc:
        logger.error(f"[universe] yfinance exception: {exc}")
        return None


def _try_cache() -> Optional[FetchResult]:
    meta = cache_read_meta(DATASET_KEY)
    if not meta:
        return None
    logger.warning("[universe] Using CACHED universe snapshot")
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
        warning       = f"Stale universe cache from {meta.get('fetched_at','unknown')} — coverage may differ",
    )
