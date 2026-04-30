"""
pipeline/adapters/options_chain.py
PCR OI + options chain source ladder.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Any, Dict

import pandas as pd

from pipeline.adapters.base import FetchResult, cache_write, cache_read_meta, now_iso
from pipeline.adapters.nse_session import fetch_nse_json

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
    # ── Rung 1: Research360 (primary — no broker IP lock) ─────────────────
    logger.info("[pcr] Attempting Rung 1: Research360...")
    result = _try_research360_pcr()
    if result and result.success:
        cache_write(PCR_KEY, result)
        return result

    # ── Rung 2: Research360 DOM Scraper (as requested) ────────────────────
    logger.info("[pcr] Attempting Rung 2: Research360 DOM Scraper...")
    result = _try_r360_dom_pcr()
    if result and result.success:
        cache_write(PCR_KEY, result)
        return result

    # ── Rung 3: Stealth NSE API (REAL fallback) ───────────────────────────
    logger.info("[pcr] Attempting Rung 3: Stealth NSE...")
    result = _try_stealth_nse_pcr()
    if result and result.success:
        cache_write(PCR_KEY, result)
        return result

    # ── Rung 4: Cache ────────────────────────────────────────────────────
    cached = _try_cache_pcr()
    if cached and cached.success:
        return cached

    return FetchResult.missing(PCR_KEY, PCR_CRIT, "PCR OI: all sources failed")


def fetch_options_chain() -> FetchResult:
    """Full options chain (for max pain, OI distribution)."""
    # ── Rung 1: Research360 DOM Scraper ──────────────────────────────────
    logger.info("[options_chain] Attempting Rung 1: Research360 DOM Scraper...")
    result = _try_r360_dom_chain()
    if result and result.success:
        cache_write(OI_KEY, result)
        return result

    # ── Rung 2: Stealth NSE API (Fallback) ────────────────────────────────
    logger.info("[options_chain] Attempting Rung 2: Stealth NSE...")
    result = _try_stealth_nse_chain()
    if result and result.success:
        cache_write(OI_KEY, result)
        return result

    # ── Rung 3: Cache ────────────────────────────────────────────────────
    cached = _try_cache_chain()
    if cached and cached.success:
        return cached

    return FetchResult.missing(OI_KEY, OI_CRIT, "Options chain: all sources failed")


def _try_research360_pcr() -> Optional[FetchResult]:
    """Rung 1: Research360 public API — Nifty PCR (no broker IP required)."""
    try:
        from pipeline.adapters.research360 import get_pcr
        pcr = get_pcr(SYMBOL)
        if pcr is None:
            return None
        
        if not (PCR_MIN <= pcr <= PCR_MAX):
            logger.warning(f"[pcr/r360] PCR {pcr} out of range")
            return None

        return FetchResult(
            dataset_key=PCR_KEY, provider="research360", source_type="REAL",
            freshness="FRESH", criticality=PCR_CRIT, success=True, trading_valid=True,
            market_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            fetched_at=now_iso(), record_count=1, payload={"pcr": pcr}
        )
    except Exception as exc:
        logger.warning(f"[pcr/r360] exception: {exc}")
        return None


# FUTURE: Shoonya/Dhan primary (pending static IP)
def _try_shoonya_pcr() -> Optional[FetchResult]:  # noqa: ARG001
    """FUTURE Rung — Shoonya (blocked: no static IP). Returns None always."""
    return None


def _try_stealth_nse_pcr() -> Optional[FetchResult]:
    """Rung 2: Stealth fetch from NSE JSON API."""
    # Try both indices and equities endpoint in case one is blocked
    endpoints = [
        f"https://www.nseindia.com/api/option-chain-indices?symbol={SYMBOL}",
        f"https://www.nseindia.com/api/option-chain-equities?symbol={SYMBOL}"
    ]
    
    data = None
    for url in endpoints:
        logger.info(f"[pcr/stealth] Attempting {url}...")
        data = fetch_nse_json(url)
        if data and "filtered" in data:
            break
            
    if not data or "filtered" not in data:
        logger.warning(f"[pcr/stealth] No data returned from NSE Option Chain APIs. Response keys: {list(data.keys()) if data else 'None'}")
        return None
    
    try:
        ce_oi = data["filtered"]["ce"]["totOI"]
        pe_oi = data["filtered"]["pe"]["totOI"]
        pcr = pe_oi / ce_oi if ce_oi > 0 else 0
        
        if not (PCR_MIN <= pcr <= PCR_MAX):
            logger.warning(f"[pcr/stealth] PCR {pcr} out of range")
            return None

        return FetchResult(
            dataset_key=PCR_KEY, provider="nse_stealth", source_type="REAL",
            freshness="FRESH", criticality=PCR_CRIT, success=True, trading_valid=True,
            market_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            fetched_at=now_iso(), record_count=1, payload={"pcr": pcr}
        )
    except Exception as e:
        logger.warning(f"[pcr/stealth] parse error: {e}")
        return None


def _try_r360_dom_pcr() -> Optional[FetchResult]:
    """Rung 2: DOM Scraping from Research360 (fallback)."""
    try:
        from pipeline.adapters.r360_scraper import get_r360_pcr_dom
        pcr = get_r360_pcr_dom(SYMBOL)
        if pcr is None:
            return None
        
        if not (PCR_MIN <= pcr <= PCR_MAX):
            logger.warning(f"[pcr/r360_dom] PCR {pcr} out of range")
            return None

        return FetchResult(
            dataset_key=PCR_KEY, provider="r360_dom", source_type="SCRAPED",
            freshness="FRESH", criticality=PCR_CRIT, success=True, trading_valid=True,
            market_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            fetched_at=now_iso(), record_count=1, payload={"pcr": pcr}
        )
    except Exception as exc:
        logger.warning(f"[pcr/r360_dom] exception: {exc}")
        return None


def _try_r360_dom_chain() -> Optional[FetchResult]:
    """Fetch full options chain via R360 DOM scraping."""
    try:
        from pipeline.adapters.r360_scraper import get_r360_chain_dom
        data = get_r360_chain_dom(SYMBOL)
        if not data or "rows" not in data:
            return None
        
        return FetchResult(
            dataset_key=OI_KEY, provider="r360_dom", source_type="SCRAPED",
            freshness="FRESH", criticality=OI_CRIT, success=True, trading_valid=True,
            market_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            fetched_at=now_iso(), 
            record_count=len(data.get("rows", [])),
            payload=data
        )
    except Exception as exc:
        logger.warning(f"[options_chain/r360_dom] exception: {exc}")
        return None


def _try_stealth_nse_chain() -> Optional[FetchResult]:
    """Fetch full options chain via stealth session."""
    url = f"https://www.nseindia.com/api/option-chain-indices?symbol={SYMBOL}"
    from pipeline.adapters.nse_session import fetch_nse_json
    data = fetch_nse_json(url)
    if not data or "records" not in data:
        return None
    
    return FetchResult(
        dataset_key=OI_KEY, provider="nse_stealth", source_type="REAL",
        freshness="FRESH", criticality=OI_CRIT, success=True, trading_valid=True,
        market_date=data.get("records", {}).get("timestamp", "").split(" ")[0],
        fetched_at=now_iso(), 
        record_count=len(data.get("records", {}).get("data", [])),
        payload=data
    )


def _try_cache_pcr() -> Optional[FetchResult]:
    meta = cache_read_meta(PCR_KEY, ttl_hours=24)
    if not meta: return None
    return FetchResult(
        dataset_key=PCR_KEY, provider=meta["provider"],
        source_type="CACHED", freshness=meta["freshness"],
        criticality=PCR_CRIT, success=True, 
        trading_valid=True if meta["freshness"] == "FRESH" else False,
        market_date=meta["market_date"], fetched_at=meta["fetched_at"],
        record_count=meta["record_count"], warning=meta.get("warning")
    )


def _try_cache_chain() -> Optional[FetchResult]:
    meta = cache_read_meta(OI_KEY, ttl_hours=24)
    if not meta: return None
    return FetchResult(
        dataset_key=OI_KEY, provider=meta["provider"],
        source_type="CACHED", freshness=meta["freshness"],
        criticality=OI_CRIT, success=True, 
        trading_valid=True if meta["freshness"] == "FRESH" else False,
        market_date=meta["market_date"], fetched_at=meta["fetched_at"],
        record_count=meta["record_count"], warning=meta.get("warning")
    )
