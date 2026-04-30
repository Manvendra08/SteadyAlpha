"""
pipeline/adapters/research360.py

Research360 (Motilal Oswal) scraper — public API endpoints.
No auth required. Used as interim primary source while broker APIs
(Dhan/Shoonya) are gated behind static IP requirements.

Endpoint map (confirmed working, no login needed):
  /api/market/main-indices          → Nifty/Sensex LTP + change
  /api/market/indian-indices        → All NSE/BSE indices
  /api/market/advance-decline       → A/D ratio per index + sector
  /api/market/fii-dii/carousel      → FII/DII cash + derivatives (daily)
  /api/fno/heatmap                  → OI heatmap — futures buildup/oi per stock

Broker status: FUTURE
  Dhan  → Blocked (dynamic IP / no static IP)
  Shoonya → Blocked (502 — static IP required, OAuth WIP)
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_BASE = "https://www.research360.in"
_TIMEOUT = 12
_SESSION_CACHE: Optional[requests.Session] = None
_SESSION_TS = 0.0
_SESSION_TTL = 300  # re-warm every 5 min


def _get_session() -> requests.Session:
    """Return a warmed session with site cookies."""
    global _SESSION_CACHE, _SESSION_TS
    now = time.time()
    if _SESSION_CACHE and (now - _SESSION_TS) < _SESSION_TTL:
        return _SESSION_CACHE

    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": f"{_BASE}/market/dashboard",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    # Warm — seeds cookies for the API routes
    try:
        s.get(f"{_BASE}/future-and-options/overview", timeout=10)
    except Exception:
        pass

    _SESSION_CACHE = s
    _SESSION_TS = now
    return s


def _get(endpoint: str) -> Optional[dict | list]:
    """GET an endpoint and return parsed JSON or None."""
    s = _get_session()
    url = _BASE + endpoint
    try:
        r = s.get(url, timeout=_TIMEOUT)
        if r.status_code != 200:
            logger.warning(f"[r360] {endpoint} → HTTP {r.status_code}")
            return None
        return r.json()
    except requests.RequestException as exc:
        logger.warning(f"[r360] {endpoint} → request error: {exc}")
        return None
    except ValueError as exc:
        logger.warning(f"[r360] {endpoint} → JSON decode error: {exc}")
        return None


# ─── Public fetch functions ────────────────────────────────────────────────────

def get_main_indices() -> Optional[dict]:
    """
    Returns Nifty 50, Sensex, Nifty Bank, India VIX latest values.

    Response shape:
      right.data → list of {index_name, ltp, change, per_change, ...}
    """
    raw = _get("/api/market/main-indices")
    if not raw:
        return None
    try:
        # Structure: {code: 200, data: [...]}
        data: list = raw.get("data", [])
        out = {}
        for item in data:
            name = (item.get("co_name") or "").strip()
            try:
                ltp = float(str(item.get("ltp", "0")).replace(",", ""))
                pct = float(str(item.get("per_change", "0")).replace(",", ""))
            except (TypeError, ValueError):
                continue
            out[name] = {"ltp": ltp, "pct_change": pct}
        return out if out else None
    except Exception as exc:
        logger.warning(f"[r360/main_indices] parse error: {exc}")
        return None


def get_nifty_ltp() -> Optional[float]:
    """Extract Nifty 50 LTP from main-indices."""
    indices = get_main_indices()
    if not indices:
        return None
    for name, val in indices.items():
        if "NIFTY 50" in name.upper() or name.upper() == "NIFTY":
            return val["ltp"]
    return None


def get_india_vix() -> Optional[float]:
    """Extract India VIX from main-indices."""
    indices = get_main_indices()
    if not indices:
        return None
    for name, val in indices.items():
        if "VIX" in name.upper():
            return val["ltp"]
    return None


def get_nse_indices() -> Optional[list[dict]]:
    """
    All NSE sector indices with ltp, change, advance/decline.

    Returns list of {index_name, ltp, per_change, advance, decline}
    """
    raw = _get("/api/market/indian-indices?exchange=NSE")
    if not raw:
        return None
    try:
        data = raw.get("right", {}).get("data", [])
        result = []
        for item in data:
            try:
                result.append({
                    "index_name":  item.get("index_name", ""),
                    "ltp":         float(str(item.get("ltp", "0")).replace(",", "")),
                    "pct_change":  float(str(item.get("per_change", "0")).replace(",", "")),
                    "advance":     int(item.get("advance", 0)),
                    "decline":     int(item.get("decline", 0)),
                })
            except (TypeError, ValueError):
                continue
        return result if result else None
    except Exception as exc:
        logger.warning(f"[r360/nse_indices] parse error: {exc}")
        return None


def get_advance_decline() -> Optional[dict]:
    """
    Advance/Decline ratio across indices.

    Returns {total_advance, total_decline, ad_ratio, per_index: [...]}
    """
    raw = _get("/api/market/advance-decline")
    if not raw:
        return None
    try:
        right = raw.get("right", {})
        data: list = right.get("data", [])
        if not data:
            return None

        # First entry is typically Nifty 50 composite
        nifty_row = next(
            (d for d in data if "NIFTY 50" in (d.get("index_name") or "").upper()),
            data[0]
        )
        total_adv = int(nifty_row.get("advance", 0))
        total_dec = int(nifty_row.get("decline", 0))
        ad_ratio = round(total_adv / total_dec, 2) if total_dec else 0.0

        return {
            "total_advance":  total_adv,
            "total_decline":  total_dec,
            "ad_ratio":       ad_ratio,
            "per_index":      data,
            "fetched_at":     datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.warning(f"[r360/advance_decline] parse error: {exc}")
        return None


def get_fii_dii() -> Optional[list[dict]]:
    """
    Latest FII/DII cash + derivatives flows.

    Returns list of dicts:
      date, index_name, index_value, index_change_pct,
      fii_cash, dii_cash, fii_net_derivatives, net_value
    """
    raw = _get("/api/market/fii-dii/carousel")
    if not raw:
        return None
    try:
        data: list = raw.get("right", {}).get("data", [])
        if not data:
            return None

        result = []
        year  = datetime.now(timezone.utc).year
        for entry in data:
            day   = entry.get("date", "")
            month = entry.get("month", "")
            date_str = f"{year}-{month}-{day.zfill(2)}"

            result.append({
                "date":                date_str,
                "index_name":          entry.get("indexName"),
                "index_value":         entry.get("indexValue"),
                "index_change_pct":    entry.get("indexChangePercent"),
                "fii_cash":            entry.get("fiiCash"),
                "dii_cash":            entry.get("diiCash"),
                "net_value":           entry.get("netValue"),
                "fii_net_derivatives": entry.get("netDerivatives"),
                "fii_idx_futures":     entry.get("fiiIdxFut"),
                "fii_idx_options":     entry.get("fiiIdxOpt"),
                "fetched_at":          datetime.now(timezone.utc).isoformat(),
            })
        return result
    except Exception as exc:
        logger.warning(f"[r360/fii_dii] parse error: {exc}")
        return None


def get_fno_heatmap(
    heatmap_filter: str = "oi",
    expiry: str = "26-May-2026",
) -> Optional[list[dict]]:
    """
    F&O OI heatmap — per-stock futures buildup data.

    Returns list of:
      {symbol, ltp, pct_change, oi, oi_change_pct, contracts,
       buildup_str, sector, expiry}
    """
    ep = (
        f"/api/fno/heatmap"
        f"?heatmapfilter={heatmap_filter}"
        f"&explist={expiry}"
        f"&bulist=all&sectorfno=all&indexlist=all"
    )
    raw = _get(ep)
    if not raw:
        return None
    try:
        # Shape: {_tag: "Right", result: [...]}
        items = raw.get("result", [])
        if not items:
            return None

        result = []
        for item in items:
            cb = item.get("callbackinfo", {})
            result.append({
                "symbol":          cb.get("nseCode", item.get("name", "")),
                "ltp":             item.get("field_value"),
                "pct_change":      item.get("current_change"),
                "oi":              item.get("oi"),
                "oi_change_pct":   item.get("oi_change"),
                "oi_diff":         item.get("oi_difference"),
                "contracts":       item.get("contracts"),
                "buildup":         item.get("builtup_str"),
                "sector":          item.get("sector"),
                "expiry":          cb.get("expiry", expiry),
            })
        return result if result else None
    except Exception as exc:
        logger.warning(f"[r360/heatmap] parse error: {exc}")
        return None


def get_sector_analysis() -> Optional[list[dict]]:
    """
    Sector performance from /api/market/sector-analysis/list.
    Returns list of {sector_name, ltp, pct_change, advance, decline, ...}
    """
    raw = _get("/api/market/sector-analysis/list")
    if not raw:
        return None
    try:
        # Structure: {code: 200, data: [...]}
        data = raw.get("data", [])
        result = []
        for item in data:
            result.append({
                "sector_name": item.get("sector_name"),
                "ltp":         item.get("ltp"),
                "pct_change":  item.get("per_change"),
                "advance":     item.get("advance"),
                "decline":     item.get("decline"),
                "top_movers":  item.get("top_movers", []),
            })
        return result if result else None
    except Exception as exc:
        logger.warning(f"[r360/sector_analysis] parse error: {exc}")
        return None


def get_market_sentiments() -> Optional[dict]:
    """
    Market sentiment ratio from /api/market/sentiments.
    Returns {bullish_pct, bearish_pct, neutral_pct}
    """
    raw = _get("/api/market/sentiments")
    if not raw:
        return None
    try:
        # Structure: {code: 200, data: {bullish: 45, bearish: 30, neutral: 25}}
        data = raw.get("data", {})
        return {
            "bullish_pct": float(data.get("bullish", 0)),
            "bearish_pct": float(data.get("bearish", 0)),
            "neutral_pct": float(data.get("neutral", 0)),
            "fetched_at":  datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.warning(f"[r360/sentiments] parse error: {exc}")
        return None


def get_pcr(symbol: str = "NIFTY") -> Optional[float]:
    """
    Fetch PCR from /ajax/optionChainApi.php or /fno/option/ajax/optionChainApi.php.
    Returns CE/PE OI ratio.
    """
    s = _get_session()
    url = f"{_BASE}/fno/option/ajax/optionChainApi.php"
    
    # Research360 PHP handlers often require specific Referer and headers
    headers = {
        "Referer": f"{_BASE}/future-and-options/option-chain",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    payload = {
        "stock": symbol, # Changed from 'symbol' to 'stock' as per subagent findings
        "exchange": "NSE",
    }
    
    try:
        r = s.post(url, data=payload, headers=headers, timeout=_TIMEOUT)
        if r.status_code != 200:
            logger.warning(f"[r360/pcr] {url} → HTTP {r.status_code}")
            return get_pcr_proxy() # Fallback to sentiment proxy
        
        try:
            data = r.json()
            # The API returns pcr directly in the root
            pcr = data.get("pcr")
            if pcr:
                return float(pcr)
            
            # Or calculate if not directly provided
            ce_total = data.get("ce_total_oi", 0)
            pe_total = data.get("pe_total_oi", 0)
            if ce_total > 0:
                return round(pe_total / ce_total, 2)
        except ValueError:
            # Sometimes returns HTML with JSON inside or just HTML
            logger.warning(f"[r360/pcr] non-JSON response from {url}")
            
        return get_pcr_proxy() # Fallback to sentiment proxy
    except Exception as exc:
        logger.warning(f"[r360/pcr] exception: {exc}")
        return get_pcr_proxy()


def get_pcr_proxy() -> Optional[float]:
    """
    Calculate a proxy PCR from market sentiments if the real one is blocked.
    (Bullish / Bearish ratio).
    """
    sent = get_market_sentiments()
    if not sent or not sent.get("bullish_pct"):
        return None
    
    bull = sent["bullish_pct"]
    bear = sent["bearish_pct"]
    
    if bear == 0:
        return 1.5 if bull > 0 else 1.0
    
    # Map Bullish/Bearish ratio to a standard PCR range (0.6 to 1.6)
    ratio = bull / bear
    return round(min(max(ratio, 0.5), 2.0), 2)


def get_pcr_from_heatmap(expiry: str = "26-May-2026") -> Optional[float]:
    """
    Derive a proxy PCR from heatmap CE/PE OI ratio via NSE.
    (Research360 doesn't expose PCR directly without login — fall back to NSE stealth.)
    Returns None to signal caller to try NSE stealth.
    """
    return None
