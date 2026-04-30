"""
pipeline/adapters/fii_dii.py
FII + DII cash flow source ladder.
"""
import logging
import random
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

import pandas as pd

from pipeline.adapters.base import FetchResult, cache_write, cache_read_meta, now_iso
from pipeline.adapters.nse_session import get_nse_session

logger = logging.getLogger(__name__)

FII_KEY = "fii_flows"
DII_KEY = "dii_flows"
FII_CRITICALITY = "CRITICAL_FOR_DECISION"
DII_CRITICALITY = "IMPORTANT_NONCRITICAL"
LOOKBACK_DAYS   = 130
MIN_ROWS        = 10


def fetch_fii() -> FetchResult:
    """FII cash flows source ladder."""
    # ── Rung 1: Research360 (primary — no broker IP lock) ─────────────────
    result = _try_research360(FII_KEY, "FII")
    if result and result.success:
        cache_write(FII_KEY, result)
        return result

    # ── Rung 2: Stealth NSE API (REAL fallback) ───────────────────────────
    result = _try_stealth_nse_fiidii(FII_KEY, "FII")
    if result and result.success:
        cache_write(FII_KEY, result)
        return result

    # ── Rung 3: Stealth Moneycontrol Scrape ──────────────────────────────
    result = _try_stealth_mc_scrape(FII_KEY, "FII")
    if result and result.success:
        cache_write(FII_KEY, result)
        return result

    # ── Rung 4: Cache ────────────────────────────────────────────────────
    cached = _try_cache_flow(FII_KEY, FII_CRITICALITY)
    if cached and cached.success:
        return cached

    return FetchResult.missing(FII_KEY, FII_CRITICALITY, "FII flows: all sources failed")


def fetch_dii() -> FetchResult:
    """DII cash flows source ladder."""
    # ── Rung 1: Research360 (primary) ────────────────────────────────────
    result = _try_research360(DII_KEY, "DII")
    if result and result.success:
        cache_write(DII_KEY, result)
        return result

    # ── Rung 2: Stealth NSE API ─────────────────────────────────────────
    result = _try_stealth_nse_fiidii(DII_KEY, "DII")
    if result and result.success:
        cache_write(DII_KEY, result)
        return result

    # ── Rung 3: Cache ────────────────────────────────────────────────────
    cached = _try_cache_flow(DII_KEY, DII_CRITICALITY)
    if cached and cached.success:
        return cached

    return FetchResult.missing(DII_KEY, DII_CRITICALITY, "DII flows: all sources failed")


def _try_research360(key: str, category: str) -> Optional[FetchResult]:
    """Rung 1: Research360 public API — FII/DII cash flows."""
    try:
        from pipeline.adapters.research360 import get_fii_dii
        data_list = get_fii_dii()
        if not data_list:
            return None

        val_dict = {}
        for data in data_list:
            net_val = 0.0
            if category == "FII":
                net_val = float(data.get("fii_cash", 0))
            elif category == "DII":
                net_val = float(data.get("dii_cash", 0))
            
            # format: YYYY-MM-DD
            dt = datetime.strptime(data.get("date"), "%Y-%b-%d")
            display_date = dt.strftime("%d-%b-%Y")
            val_dict[display_date] = net_val

        return _assemble_flow_result_multi(key, val_dict, "research360")
    except Exception as exc:
        logger.warning(f"[{key}/r360] exception: {exc}")
        return None


def _try_stealth_nse_fiidii(key: str, category: str) -> Optional[FetchResult]:
    """Fetch daily FII/DII from NSE API using stealth session."""
    url = "https://www.nseindia.com/api/fiidiiTradeReact"
    try:
        session = get_nse_session()
        headers = session.headers.copy()
        headers.update({
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': 'https://www.nseindia.com/reports/fii-dii',
            'X-Requested-With': 'XMLHttpRequest',
        })
        
        resp = session.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return None
        
        data = resp.json()
        # Data is a list of objects: [{"category": "FII", "date": "28-Apr-2026", "buyValue": 100, "sellValue": 80, "netValue": 20}, ...]
        match = next((x for x in data if category in x.get("category", "").upper()), None)
        if not match:
            return None
            
        net_val = float(match["netValue"])
        date_str = match["date"] # e.g. "28-Apr-2026"
        
        return _assemble_flow_result(key, net_val, date_str, "nse_stealth")
    except Exception as e:
        logger.warning(f"[{key}/stealth] NSE API failed: {e}")
        return None


def _try_stealth_mc_scrape(key: str, category: str) -> Optional[FetchResult]:
    """Scrape Moneycontrol with stealth headers."""
    from bs4 import BeautifulSoup
    url = "https://www.moneycontrol.com/india/indexprop/market_stats.php"
    try:
        session = get_nse_session() # Re-use session for general browser mimicry
        headers = session.headers.copy()
        headers['Referer'] = "https://www.google.com"
        
        resp = session.get(url, headers=headers, timeout=15)
        if resp.status_code != 200: return None
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        table = soup.find('table', {'class': 'mctable1'})
        if not table: return None
        
        # Simple heuristic: find row containing category and extract 3rd column
        rows = table.find_all('tr')
        for row in rows:
            cols = row.find_all('td')
            if len(cols) >= 3 and category in cols[0].text.upper():
                val = float(cols[2].text.replace(',', '').strip())
                date_str = datetime.now(timezone.utc).strftime("%d-%b-%Y")
                return _assemble_flow_result(key, val, date_str, "mc_stealth")
        return None
    except Exception as e:
        logger.warning(f"[{key}/stealth] MC Scrape failed: {e}")
        return None


def _assemble_flow_result_multi(key: str, val_dict: dict[str, float], provider: str) -> Optional[FetchResult]:
    """Helper to merge multiple daily flows into cached series."""
    meta = cache_read_meta(key)
    series_data = {}
    
    if meta and "payload" in meta and meta["payload"]:
        try:
            import json
            raw_payload = meta["payload"]
            if isinstance(raw_payload, str):
                try:
                    cached_series = pd.read_json(raw_payload, typ="series")
                    series_data = cached_series.to_dict()
                except:
                    series_data = json.loads(raw_payload)
            elif isinstance(raw_payload, dict):
                series_data = raw_payload
        except Exception as e:
            logger.warning(f"[{key}] Failed to parse cached payload: {e}")

    # Merge all new dates
    for date_str, val in val_dict.items():
        series_data[date_str] = val
        
    series = pd.Series(series_data)
    
    try:
        series.index = pd.to_datetime(series.index)
        series = series.sort_index()
        series.index = series.index.strftime("%d-%b-%Y")
    except:
        series = series.sort_index()

    if len(series) > 150:
        series = series.iloc[-150:]
        
    crit = FII_CRITICALITY if key == FII_KEY else DII_CRITICALITY
    
    # Use max date from val_dict for market_date
    latest_date_str = max(val_dict.keys(), key=lambda d: pd.to_datetime(d, errors='coerce')) if val_dict else now_iso()
    
    return FetchResult(
        dataset_key=key, provider=provider, source_type="REAL",
        freshness="FRESH", criticality=crit, success=True, trading_valid=True,
        market_date=latest_date_str, fetched_at=now_iso(),
        record_count=len(series), payload=series
    )


def _assemble_flow_result(key: str, val: float, date_str: str, provider: str) -> Optional[FetchResult]:
    """Helper to merge daily flow into cached series."""
    meta = cache_read_meta(key)
    series_data = {}
    
    if meta and "payload" in meta and meta["payload"]:
        try:
            import json
            raw_payload = meta["payload"]
            if isinstance(raw_payload, str):
                # Try to load as pandas series JSON or plain dict JSON
                try:
                    cached_series = pd.read_json(raw_payload, typ="series")
                    series_data = cached_series.to_dict()
                except:
                    series_data = json.loads(raw_payload)
            elif isinstance(raw_payload, dict):
                series_data = raw_payload
        except Exception as e:
            logger.warning(f"[{key}] Failed to parse cached payload: {e}")

    # Standardize date format for index (DD-MMM-YYYY)
    series_data[date_str] = val
    series = pd.Series(series_data)
    
    # Try to convert index to datetime for proper sorting
    try:
        series.index = pd.to_datetime(series.index)
        series = series.sort_index()
        # Convert back to strings for JSON serializability
        series.index = series.index.strftime("%d-%b-%Y")
    except:
        series = series.sort_index()

    if len(series) > 150:
        series = series.iloc[-150:]
        
    crit = FII_CRITICALITY if key == FII_KEY else DII_CRITICALITY
    
    return FetchResult(
        dataset_key=key, provider=provider, source_type="REAL",
        freshness="FRESH", criticality=crit, success=True, trading_valid=True,
        market_date=date_str, fetched_at=now_iso(),
        record_count=len(series), payload=series
    )


def _try_cache_flow(key: str, criticality: str) -> Optional[FetchResult]:
    meta = cache_read_meta(key)
    if not meta: return None
    
    # Check if we can consider this "STALE" but acceptable for non-critical gating
    # For FII, we might want it to be FRESH for a valid run, but if everything fails,
    # we return it with success=True but trading_valid=False.
    
    return FetchResult(
        dataset_key=key, provider=meta.get("provider", "cache"),
        source_type="CACHED", freshness=meta.get("freshness", "STALE"),
        criticality=criticality, success=True, 
        trading_valid=False, # Cache is never valid for live trading signals
        market_date=meta.get("market_date"), fetched_at=meta.get("fetched_at"),
        record_count=meta.get("record_count"), payload=None,
        warning=f"Using stale cache from {meta.get('fetched_at', 'unknown')}"
    )
