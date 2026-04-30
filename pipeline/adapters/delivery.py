"""
pipeline/adapters/delivery.py
Dataset: Delivery Data
Criticality: IMPORTANT_NONCRITICAL
"""

import logging
import pandas as pd
from typing import Optional
from .base import FetchResult, CRITICALITY, with_retry, cache_write, cache_read_meta, now_iso
from .nse_session import fetch_nse_json

logger = logging.getLogger(__name__)

DATASET_KEY = "delivery_data"
CRITICALITY_LEVEL = CRITICALITY["IMPORTANT_NONCRITICAL"]

def fetch(config: dict) -> FetchResult:
    """
    Source ladder:
    1. Structured NSE source (stealth)
    2. Cached real snapshot
    3. else MISSING
    """
    # Rung 1: NSE Stealth
    result = _try_nse_delivery()
    if result and result.success:
        cache_write(DATASET_KEY, result)
        return result
    
    # Rung 2: CACHED
    ttls = config.get("ingestion", {}).get("freshness_ttl_hours", {})
    ttl = ttls.get(DATASET_KEY, 24)
    cached = cache_read_meta(DATASET_KEY, ttl_hours=ttl)
    if cached:
        return FetchResult(
            dataset_key=DATASET_KEY, provider=cached["provider"],
            source_type="CACHED", freshness=cached["freshness"],
            criticality=CRITICALITY_LEVEL, success=True, trading_valid=True,
            market_date=cached["market_date"], fetched_at=cached["fetched_at"],
            record_count=cached["record_count"], warning=cached.get("warning"),
            payload=None # placeholder
        )
        
    return FetchResult.missing(DATASET_KEY, CRITICALITY_LEVEL, "Delivery data unavailable")

def _try_nse_delivery() -> Optional[FetchResult]:
    """Fetch delivery % for NIFTY-50 proxy (e.g. RELIANCE) to gauge market breadth."""
    symbol = "RELIANCE"
    url = f"https://www.nseindia.com/api/quote-equity?symbol={symbol}&section=trade_info"
    
    data = fetch_nse_json(url)
    if not data or "securityWiseDP" not in data:
        return None
        
    try:
        dp = data["securityWiseDP"]
        del_pct = dp.get("deliveryToTradedQuantity", 0)
        
        return FetchResult(
            dataset_key=DATASET_KEY, provider="nse_stealth", source_type="REAL",
            freshness="FRESH", criticality=CRITICALITY_LEVEL, success=True, trading_valid=True,
            market_date=data.get("marketStatus", {}).get("tradeDate"),
            fetched_at=now_iso(), record_count=1, payload={"delivery_pct": del_pct}
        )
    except Exception as e:
        logger.warning(f"[delivery/nse] parse error: {e}")
        return None
