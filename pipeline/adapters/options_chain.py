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


from pipeline.adapters.nse_session import fetch_nse_api

@with_retry(max_attempts=3, base_delay=3.0)
def _fetch_options_chain_raw() -> dict:
    url = f"https://www.nseindia.com/api/option-chain-indices?symbol={SYMBOL}"
    return fetch_nse_api(url)

def _try_nsepython_pcr() -> Optional[FetchResult]:
    # Rung 1: previously nsepython, now using direct custom session
    try:
        data = _fetch_options_chain_raw()
        if not data or "records" not in data or "data" not in data["records"]:
            logger.warning("[pcr] custom session returned empty or blocked response")
            return None
            
        records = data["records"]["data"]
        pe_oi = sum(item.get("PE", {}).get("openInterest", 0) for item in records)
        ce_oi = sum(item.get("CE", {}).get("openInterest", 0) for item in records)
        
        if ce_oi == 0:
            return None
            
        pcr_val = pe_oi / ce_oi
        
        # Validation
        if not (PCR_MIN <= pcr_val <= PCR_MAX):
            logger.warning(f"[pcr] PCR {pcr_val} outside sanity range [{PCR_MIN},{PCR_MAX}]")
            return None

        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return FetchResult(
            dataset_key   = PCR_KEY,
            provider      = "custom_session",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = PCR_CRIT,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = 1,
            payload       = {"pcr_latest": float(pcr_val)},
        )
    except Exception as exc:
        logger.error(f"[pcr] custom session exception: {exc}")
        return None

def _try_nsepython_chain() -> Optional[FetchResult]:
    try:
        data = _fetch_options_chain_raw()
        if not data or "records" not in data or "data" not in data["records"]:
            return None
            
        df = pd.DataFrame(data["records"]["data"])
        if df.empty:
            return None

        market_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return FetchResult(
            dataset_key   = OI_KEY,
            provider      = "custom_session",
            source_type   = "REAL",
            freshness     = "FRESH",
            criticality   = OI_CRIT,
            success       = True,
            trading_valid = True,
            market_date   = market_date,
            fetched_at    = now_iso(),
            record_count  = len(df),
            payload       = df,
        )
    except Exception as exc:
        logger.error(f"[options_chain] custom session exception: {exc}")
        return None

# ─── Scrape placeholder ───────────────────────────────────────────────────────

def _try_scrape_options() -> Optional[FetchResult]:
    """
    Fallback Rung 2: Scrape from alternative sources (e.g. Sensibull/Moneycontrol)
    if NSE API completely blocks the robust session.
    """
    logger.info("[pcr] Scrape fallback logic not yet implemented for third party.")
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
