"""
pipeline/adapters/options_chain.py
PCR OI + options chain source ladder:
  1. nsepython option-chain (REAL)
  2. Direct NSE structured endpoint (FALLBACK placeholder)
  3. Controlled scrape of options chain page (SCRAPED placeholder)
  4. Disk cache (CACHED)
  5. MISSING
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from pipeline.adapters.base import FetchResult, with_retry, cache_write, cache_read_meta, now_iso

logger = logging.getLogger(__name__)

PCR_KEY       = "pcr_oi"
OI_KEY        = "options_chain"
PCR_CRIT      = "CRITICAL_FOR_DECISION"
OI_CRIT       = "IMPORTANT_NONCRITICAL"

PCR_MIN = 0.3
PCR_MAX = 5.0
SYMBOL  = "NIFTY"


def fetch_pcr() -> FetchResult:
    """PCR OI source ladder."""
    result = _try_nsepython_pcr()
    if result and result.success:
        cache_write(PCR_KEY, result)
        return result

    logger.warning("[pcr] nsepython failed. NSE direct endpoint not yet implemented.")

    scraped = _try_scrape_options()
    if scraped and scraped.success:
        cache_write(PCR_KEY, scraped)
        return scraped

    cached = _try_cache_pcr()
    if cached and cached.success:
        return cached

    return FetchResult.missing(PCR_KEY, PCR_CRIT, "PCR OI: all sources failed")


def fetch_options_chain() -> FetchResult:
    """Full options chain (for max pain, OI distribution)."""
    result = _try_nsepython_chain()
    if result and result.success:
        cache_write(OI_KEY, result)
        return result

    cached = _try_cache_chain()
    if cached and cached.success:
        return cached

    return FetchResult.missing(OI_KEY, OI_CRIT, "Options chain: all sources failed")


# ─── nsepython ────────────────────────────────────────────────────────────────

@with_retry(max_attempts=2, base_delay=2.0)
def _nsepython_pcr_raw() -> dict:
    from nsepython import pcr  # type: ignore
    return pcr(SYMBOL)


def _try_nsepython_pcr() -> Optional[FetchResult]:
    try:
        data = _nsepython_pcr_raw()
        if data is None:
            return None

        # nsepython pcr() returns {'pcr': float, ...}
        pcr_val = None
        if isinstance(data, dict):
            pcr_val = data.get("pcr") or data.get("PCR") or data.get("CE/PE OI")
        elif isinstance(data, (int, float)):
            pcr_val = float(data)

        if pcr_val is None:
            logger.warning(f"[pcr] nsepython: unexpected response shape: {type(data)}")
            return None

        pcr_val = float(pcr_val)

        # Validation
        if not (PCR_MIN <= pcr_val <= PCR_MAX):
            logger.warning(f"[pcr] PCR {pcr_val} outside sanity range [{PCR_MIN},{PCR_MAX}]")
            return None

        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return FetchResult(
            dataset_key   = PCR_KEY,
            provider      = "nsepython",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = PCR_CRIT,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = 1,
            payload       = {"pcr_latest": pcr_val},
        )
    except ImportError:
        logger.warning("[pcr] nsepython not installed")
        return None
    except Exception as exc:
        logger.error(f"[pcr] nsepython exception: {exc}")
        return None


@with_retry(max_attempts=2, base_delay=2.0)
def _nsepython_chain_raw() -> pd.DataFrame:
    from nsepython import option_chain  # type: ignore
    return option_chain(SYMBOL)


def _try_nsepython_chain() -> Optional[FetchResult]:
    try:
        df = _nsepython_chain_raw()
        if df is None or (hasattr(df, 'empty') and df.empty):
            return None

        record_count = len(df) if hasattr(df, '__len__') else None
        market_date  = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        return FetchResult(
            dataset_key   = OI_KEY,
            provider      = "nsepython",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = OI_CRIT,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = record_count,
            payload       = df,
        )
    except ImportError:
        return None
    except Exception as exc:
        logger.error(f"[options_chain] exception: {exc}")
        return None


# ─── Scrape placeholder ───────────────────────────────────────────────────────

def _try_scrape_options() -> Optional[FetchResult]:
    """
    TODO: NSE options-chain page scrape.
    URL: https://www.nseindia.com/option-chain
    Implement: requests session with NSE headers → parse JSON embedded in page.
    Must validate: strike list non-empty, CE+PE OI numeric, PCR computable.
    """
    logger.info("[pcr] Scrape fallback not yet implemented.")
    return None


# ─── Cache ────────────────────────────────────────────────────────────────────

def _try_cache_pcr() -> Optional[FetchResult]:
    meta = cache_read_meta(PCR_KEY)
    if not meta:
        return None
    logger.warning("[pcr] Using CACHED PCR snapshot")
    return FetchResult(
        dataset_key   = PCR_KEY,
        provider      = "cache",
        source_type   = "CACHED",
        freshness     = "STALE",
        criticality   = PCR_CRIT,
        success       = True,
        trading_valid = False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,
        warning       = "Stale PCR cache — live fetch failed",
    )


def _try_cache_chain() -> Optional[FetchResult]:
    meta = cache_read_meta(OI_KEY)
    if not meta:
        return None
    return FetchResult(
        dataset_key   = OI_KEY,
        provider      = "cache",
        source_type   = "CACHED",
        freshness     = "STALE",
        criticality   = OI_CRIT,
        success       = True,
        trading_valid = False,
        market_date   = meta.get("market_date"),
        fetched_at    = now_iso(),
        record_count  = meta.get("record_count"),
        payload       = None,
        warning       = "Stale options chain cache",
    )
