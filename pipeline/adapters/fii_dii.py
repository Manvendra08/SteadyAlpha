"""
pipeline/adapters/fii_dii.py
FII + DII cash flow source ladder:
  1. nsepython (REAL)
  2. NSE published CSV/endpoint (FALLBACK placeholder)
  3. Controlled scrape of NSE/moneycontrol table (SCRAPED placeholder)
  4. Disk cache (CACHED)
  5. MISSING
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

FII_KEY = "fii_flows"
DII_KEY = "dii_flows"
FII_CRITICALITY = "CRITICAL_FOR_DECISION"
DII_CRITICALITY = "IMPORTANT_NONCRITICAL"
LOOKBACK_DAYS   = 130
MIN_ROWS        = 10


def fetch_fii() -> FetchResult:
    """FII cash flows source ladder."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=LOOKBACK_DAYS)

    result = _try_nsepython_fii(start.strftime("%d-%m-%Y"), end.strftime("%d-%m-%Y"))
    if result and result.success:
        cache_write(FII_KEY, result)
        return result

    logger.warning("[fii] nsepython failed. NSE CSV endpoint not yet implemented.")

    # Rung 3: scrape placeholder
    scraped = _try_scrape_fii()
    if scraped and scraped.success:
        cache_write(FII_KEY, scraped)
        return scraped

    # Rung 4: cache
    cached = _try_cache_fii()
    if cached and cached.success:
        return cached

    return FetchResult.missing(FII_KEY, FII_CRITICALITY, "FII flows: all sources failed")


def fetch_dii() -> FetchResult:
    """DII cash flows source ladder (noncritical)."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=LOOKBACK_DAYS)

    result = _try_nsepython_dii(start.strftime("%d-%m-%Y"), end.strftime("%d-%m-%Y"))
    if result and result.success:
        cache_write(DII_KEY, result)
        return result

    cached = _try_cache_dii()
    if cached and cached.success:
        return cached

    return FetchResult.missing(DII_KEY, DII_CRITICALITY, "DII flows: all sources failed")


# ─── nsepython attempts ───────────────────────────────────────────────────────

@with_retry(max_attempts=2, base_delay=2.0)
def _nsepython_fii_raw(start_str: str, end_str: str) -> pd.DataFrame:
    """
    nsepython FII fetch. Requires: pip install nsepython
    Format: DD-MM-YYYY
    """
    from nsepython import fii_dii_data  # type: ignore
    df = fii_dii_data(start_str, end_str)
    return df


def _try_nsepython_fii(start_str: str, end_str: str) -> Optional[FetchResult]:
    try:
        df = _nsepython_fii_raw(start_str, end_str)
        if df is None or df.empty:
            return None

        # Validate numeric FII column exists
        fii_col = next((c for c in df.columns if "FII" in c.upper() or "FOREIGN" in c.upper()), None)
        if fii_col is None:
            logger.warning("[fii] nsepython: no FII column found in response")
            return None

        fii_series = pd.to_numeric(df[fii_col], errors="coerce").dropna()
        if len(fii_series) < MIN_ROWS:
            logger.warning(f"[fii] nsepython: only {len(fii_series)} valid rows")
            return None

        return FetchResult(
            dataset_key   = FII_KEY,
            provider      = "nsepython",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = FII_CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = end_str,
            fetched_at    = now_iso(),
            record_count  = len(fii_series),
            payload       = fii_series,
        )
    except ImportError:
        logger.warning("[fii] nsepython not installed. Skipping.")
        return None
    except Exception as exc:
        logger.error(f"[fii] nsepython exception: {exc}")
        return None


@with_retry(max_attempts=2, base_delay=2.0)
def _nsepython_dii_raw(start_str: str, end_str: str) -> pd.DataFrame:
    from nsepython import fii_dii_data  # type: ignore
    return fii_dii_data(start_str, end_str)


def _try_nsepython_dii(start_str: str, end_str: str) -> Optional[FetchResult]:
    try:
        df = _nsepython_dii_raw(start_str, end_str)
        if df is None or df.empty:
            return None

        dii_col = next((c for c in df.columns if "DII" in c.upper() or "DOMESTIC" in c.upper()), None)
        if dii_col is None:
            return None

        dii_series = pd.to_numeric(df[dii_col], errors="coerce").dropna()
        if len(dii_series) < MIN_ROWS:
            return None

        return FetchResult(
            dataset_key   = DII_KEY,
            provider      = "nsepython",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = DII_CRITICALITY,
            success       = True,
            trading_valid = True,
            market_date   = end_str,
            fetched_at    = now_iso(),
            record_count  = len(dii_series),
            payload       = dii_series,
        )
    except ImportError:
        return None
    except Exception as exc:
        logger.error(f"[dii] nsepython exception: {exc}")
        return None


# ─── Scrape placeholder ───────────────────────────────────────────────────────

def _try_scrape_fii() -> Optional[FetchResult]:
    """
    Controlled scrape of NSE/moneycontrol FII table.
    TODO: implement HTML parsing with requests + BeautifulSoup.
    Must: validate schema after parse, mark SCRAPED, persist parse timestamp.
    """
    logger.info("[fii] Scrape fallback not yet implemented.")
    return None


# ─── Cache fallbacks ──────────────────────────────────────────────────────────

def _try_cache_fii() -> Optional[FetchResult]:
    meta = cache_read_meta(FII_KEY)
    if not meta:
        return None
    logger.warning("[fii] Using CACHED FII snapshot")
    return FetchResult(
        dataset_key   = FII_KEY,
        provider      = "cache",
        source_type   = "CACHED",
        freshness     = "STALE",
        criticality   = FII_CRITICALITY,
        success       = True,
        trading_valid = False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,
        warning       = f"Stale FII cache from {meta.get('fetched_at', 'unknown')}",
    )


def _try_cache_dii() -> Optional[FetchResult]:
    meta = cache_read_meta(DII_KEY)
    if not meta:
        return None
    return FetchResult(
        dataset_key   = DII_KEY,
        provider      = "cache",
        source_type   = "CACHED",
        freshness     = "STALE",
        criticality   = DII_CRITICALITY,
        success       = True,
        trading_valid = False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,
        warning       = "Stale DII cache",
    )
