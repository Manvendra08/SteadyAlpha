"""
pipeline/adapters/nifty_ohlcv.py
Fetch Nifty 50 OHLCV with source ladder:
  1. Research360 /api/market/main-indices (PRIMARY — no broker auth needed)
  2. yfinance ^NSEI (REAL fallback)
  3. disk cache last valid snapshot (CACHED)
  4. MISSING

FUTURE (pending static IP):
  Rung 0: Dhan get_nifty_ohlcv  — blocked (dynamic IP)
  Rung 0: Shoonya price series  — blocked (502 / OAuth WIP)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

DATASET_KEY  = "nifty_ohlcv"
CRITICALITY  = "CRITICAL_FOR_DECISION"
SYMBOL       = "^NSEI"
LOOKBACK_DAYS = 400
MIN_ROWS      = 30   # validation gate


def fetch(config: dict = {}) -> FetchResult:
    """Full source ladder for Nifty 50 OHLCV."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=LOOKBACK_DAYS)

    # ── Rung 1: yfinance (Primary for History) ────────────────────────────
    result = _try_yfinance(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 2: Research360 (Secondary for Snapshot Only) ─────────────────
    result = _try_research360()
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 3: disk cache ────────────────────────────────────────────────
    ttls = config.get("ingestion", {}).get("freshness_ttl_hours", {})
    ttl = ttls.get(DATASET_KEY, 24)
    cached = _try_cache(ttl_hours=ttl)
    if cached and cached.success:
        return cached

    # ── Rung 4: MISSING ───────────────────────────────────────────────────
    return FetchResult.missing(DATASET_KEY, CRITICALITY, "All Nifty OHLCV sources failed")


def _try_research360() -> Optional[FetchResult]:
    """Rung 1: Research360 public API — Nifty LTP (no broker IP required)."""
    try:
        from pipeline.adapters.research360 import get_nifty_ltp
        ltp = get_nifty_ltp()
        if ltp is None:
            return None
        if not (5000 <= ltp <= 40000):
            logger.warning(f"[nifty_ohlcv/r360] price sanity fail: {ltp}")
            return None
        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # Build minimal single-row DataFrame matching expected schema
        df = pd.DataFrame(
            [{"Open": ltp, "High": ltp, "Low": ltp, "Close": ltp, "Volume": 0}],
            index=pd.to_datetime([market_date]),
        )
        return FetchResult(
            dataset_key  = DATASET_KEY,
            provider     = "research360",
            source_type  = "REAL",
            freshness    = "FRESH",
            criticality  = CRITICALITY,
            success      = True,
            trading_valid= True,
            market_date  = market_date,
            fetched_at   = now_iso(),
            record_count = 1,
            payload      = df,
            warning      = "R360 snapshot: LTP only, no OHLCV history. yfinance for history.",
        )
    except Exception as exc:
        logger.warning(f"[nifty_ohlcv/r360] exception: {exc}")
        return None


# FUTURE: Dhan primary (pending static IP)
def _try_shoonya(lookback_days: int) -> Optional[FetchResult]:  # noqa: ARG001
    """FUTURE Rung — Dhan/Shoonya (blocked: no static IP). Returns None always."""
    return None


@with_retry(max_attempts=3, base_delay=1.0)
def _fetch_yfinance_raw(start: str, end: str) -> pd.DataFrame:
    import yfinance as yf
    df = yf.download(SYMBOL, start=start, end=end, progress=False, auto_adjust=True)
    
    # Handle MultiIndex columns (Price, Ticker)
    if isinstance(df.columns, pd.MultiIndex):
        if SYMBOL in df.columns.levels[1]:
            df = df.xs(SYMBOL, axis=1, level=1)
        else:
            # Fallback: take the first level 1 if only one ticker
            tickers = df.columns.levels[1]
            if len(tickers) == 1:
                df = df.xs(tickers[0], axis=1, level=1)
    
    return df


def _try_yfinance(start: str, end: str) -> Optional[FetchResult]:
    try:
        df = _fetch_yfinance_raw(start, end)
        if df is None or df.empty:
            logger.warning("[nifty_ohlcv] yfinance returned empty DataFrame")
            return None

        # ── Validation ────────────────────────────────────────────────────
        required = {"Open", "High", "Low", "Close", "Volume"}
        if not required.issubset(set(df.columns)):
            logger.warning(f"[nifty_ohlcv] yfinance missing columns: {required - set(df.columns)}")
            return None

        df = df.dropna(subset=["Close"])
        if len(df) < MIN_ROWS:
            logger.warning(f"[nifty_ohlcv] yfinance only {len(df)} rows, need {MIN_ROWS}")
            return None

        # Price Sanity Check (Spec #9)
        latest_price = df["Close"].iloc[-1]
        if not (5000 <= latest_price <= 40000):
            logger.warning(f"[nifty_ohlcv] Price sanity check failed: {latest_price}")
            return None

        market_date = df.index[-1].strftime("%Y-%m-%d") if not df.empty else None
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
        )
    except Exception as exc:
        logger.error(f"[nifty_ohlcv] yfinance exception: {exc}")
        return None


def _try_cache(ttl_hours: int) -> Optional[FetchResult]:
    """Return CACHED result (metadata only)."""
    meta = cache_read_meta(DATASET_KEY, ttl_hours=ttl_hours)
    if not meta:
        return None
    
    freshness = meta.get("freshness", "STALE")
    logger.warning(f"[nifty_ohlcv] Using CACHED snapshot ({freshness})")
    
    return FetchResult(
        dataset_key   = DATASET_KEY,
        provider      = meta.get("provider", "cache"),
        source_type   = "CACHED",
        freshness     = freshness,
        criticality   = CRITICALITY,
        success       = True,
        trading_valid = True if freshness == "FRESH" else False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,  # payload not cached to disk — must refetch or degrade
        warning       = f"Cached snapshot from {meta.get('fetched_at', 'unknown')} — live fetch failed",
    )
