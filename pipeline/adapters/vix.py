"""
pipeline/adapters/vix.py
India VIX source ladder:
  1. yfinance ^INDIAVIX (REAL)
  2. NSE VIX historical file endpoint (FALLBACK placeholder)
  3. disk cache (CACHED)
  4. MISSING — hardcoded constants FORBIDDEN
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

DATASET_KEY = "india_vix"
CRITICALITY = "CRITICAL_FOR_DECISION"
SYMBOL      = "^INDIAVIX"
MIN_VALUE   = 5.0    # sanity lower bound
MAX_VALUE   = 100.0  # sanity upper bound


def fetch(config: dict = {}) -> FetchResult:
    """Full source ladder for India VIX."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=30)

    # ── Rung 1: yfinance ──────────────────────────────────────────────────
    result = _try_yfinance(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result

    # ── Rung 2: NSE VIX file (placeholder) ───────────────────────────────
    logger.warning("[vix] yfinance failed. NSE VIX file endpoint not yet implemented.")

    # ── Rung 3: disk cache ────────────────────────────────────────────────
    ttls = config.get("ingestion", {}).get("freshness_ttl_hours", {})
    ttl = ttls.get(DATASET_KEY, 24)
    cached = _try_cache(ttl_hours=ttl)
    if cached and cached.success:
        return cached

    # ── Rung 4: MISSING — no hardcoded fallback ───────────────────────────
    return FetchResult.missing(
        DATASET_KEY, CRITICALITY,
        "India VIX unavailable — all sources failed. Hardcoded constants forbidden.",
    )


@with_retry(max_attempts=3, base_delay=1.0)
def _fetch_yfinance_raw(start: str, end: str) -> pd.DataFrame:
    import yfinance as yf
    df = yf.download(SYMBOL, start=start, end=end, progress=False, auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        if SYMBOL in df.columns.levels[1]:
            df = df.xs(SYMBOL, axis=1, level=1)
        else:
            tickers = df.columns.levels[1]
            if len(tickers) == 1:
                df = df.xs(tickers[0], axis=1, level=1)
    return df


def _try_yfinance(start: str, end: str) -> Optional[FetchResult]:
    try:
        df = _fetch_yfinance_raw(start, end)
        if df is None or df.empty:
            logger.warning("[vix] yfinance returned empty DataFrame for ^INDIAVIX")
            return None

        df = df.dropna(subset=["Close"])
        if df.empty:
            return None

        latest_vix = float(df["Close"].iloc[-1])

        # ── Validation ────────────────────────────────────────────────────
        if not (MIN_VALUE <= latest_vix <= MAX_VALUE):
            logger.warning(f"[vix] VIX value {latest_vix} out of sanity range [{MIN_VALUE},{MAX_VALUE}]")
            return None

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
            payload       = {"vix_latest": latest_vix, "vix_series": df["Close"]},
        )
    except Exception as exc:
        logger.error(f"[vix] yfinance exception: {exc}")
        return None


def _try_cache(ttl_hours: int) -> Optional[FetchResult]:
    meta = cache_read_meta(DATASET_KEY, ttl_hours=ttl_hours)
    if not meta:
        return None
    
    freshness = meta.get("freshness", "STALE")
    logger.warning(f"[vix] Using CACHED VIX snapshot ({freshness})")
    
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
        payload       = None,
        warning       = f"Stale VIX cache from {meta.get('fetched_at', 'unknown')}",
    )
