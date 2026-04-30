"""
pipeline/adapters/shoonya_market.py
Shoonya (Finvasia) primary market-data adapter.
Provides:
  - get_nifty_ohlcv(lookback_days)  → pd.DataFrame (OHLCV, DatetimeIndex)
  - get_vix_latest()                → float
  - get_pcr_oi()                    → dict {pcr, call_oi, put_oi}
  - get_fii_dii_daily()             → dict {fii_net, dii_net, date}
  - get_sector_ohlcv(lookback_days) → pd.DataFrame  [symbols managed internally]
  - get_universe_ohlcv(symbols, days)→ pd.DataFrame

All functions return None on any failure — callers decide how to cascade.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

from pipeline.adapters.shoonya_session import get_shoonya_api

logger = logging.getLogger(__name__)

# ─── Symbol constants (Shoonya instrument tokens / exchange:symbol notation) ──
# These use the NSE exchange prefix required by Shoonya's API.
# NIFTY index uses NFO for options; NSE for cash / OHLCV history.
NIFTY_EXCH   = "NSE"
NIFTY_TOKEN  = "26000"   # Shoonya's standard token for NIFTY 50 index
VIX_TOKEN    = "26017"   # India VIX
VIX_EXCH     = "NSE"


# ─── helpers ─────────────────────────────────────────────────────────────────

def _api_call(fn_name: str, *args, **kwargs):
    """Call api.<fn_name>(...) safely; return None on exception."""
    api = get_shoonya_api()
    if api is None:
        return None
    try:
        method = getattr(api, fn_name, None)
        if method is None:
            logger.warning(f"[shoonya] API has no method '{fn_name}'")
            return None
        return method(*args, **kwargs)
    except Exception as exc:
        logger.error(f"[shoonya] {fn_name} failed: {exc}")
        return None


def _shoonya_bar_to_df(bars: list) -> pd.DataFrame:
    """Convert Shoonya time-price bar list to standard OHLCV DataFrame."""
    records = []
    for b in bars:
        try:
            records.append({
                "Date":   pd.to_datetime(b.get("time") or b.get("ssboe"), unit="s", utc=True),
                "Open":   float(b.get("into") or b.get("open") or 0),
                "High":   float(b.get("inth") or b.get("high") or 0),
                "Low":    float(b.get("intl") or b.get("low") or 0),
                "Close":  float(b.get("intc") or b.get("close") or 0),
                "Volume": float(b.get("v") or b.get("volume") or 0),
            })
        except Exception:
            continue
    if not records:
        return pd.DataFrame()
    df = pd.DataFrame(records).set_index("Date").sort_index()
    return df


# ─── OHLCV ───────────────────────────────────────────────────────────────────

def get_nifty_ohlcv(lookback_days: int = 400) -> Optional[pd.DataFrame]:
    """
    Fetch Nifty 50 daily OHLCV from Shoonya get_daily_price_series.
    Returns OHLCV DataFrame or None.
    """
    api = get_shoonya_api()
    if api is None:
        return None

    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    start_str = start.strftime("%d-%m-%Y")
    end_str   = end.strftime("%d-%m-%Y")

    try:
        bars = api.get_daily_price_series(
            exchange=NIFTY_EXCH,
            token=NIFTY_TOKEN,      # "26000"
            startdate=start_str,
            enddate=end_str,
        )
        if not bars or not isinstance(bars, list):
            logger.warning(f"[shoonya] get_daily_price_series returned: {type(bars)}")
            return None
        df = _shoonya_bar_to_df(bars)
        if df.empty:
            return None
        logger.info(f"[shoonya] Nifty OHLCV: {len(df)} bars from {start_str} to {end_str}")
        return df
    except Exception as exc:
        logger.error(f"[shoonya] get_nifty_ohlcv exception: {exc}")
        return None


def get_universe_ohlcv(symbols: list[str], lookback_days: int = 90) -> Optional[pd.DataFrame]:
    """
    Fetch daily close prices for a list of NSE symbols from Shoonya.
    Returns DataFrame (columns=symbols, DatetimeIndex) or None.
    Symbols should be bare NSE trading symbols (e.g. 'RELIANCE', 'INFY').
    """
    api = get_shoonya_api()
    if api is None:
        return None

    end      = datetime.now(timezone.utc)
    start    = end - timedelta(days=lookback_days)
    s_str    = start.strftime("%d-%m-%Y")
    e_str    = end.strftime("%d-%m-%Y")
    closes   = {}
    failures = 0

    for sym in symbols:
        try:
            bars = api.get_daily_price_series(
                exchange="NSE",
                tradingsymbol=sym,
                startdate=s_str,
                enddate=e_str,
            )
            if not bars or not isinstance(bars, list):
                failures += 1
                continue
            df_sym = _shoonya_bar_to_df(bars)
            if df_sym.empty:
                failures += 1
                continue
            closes[sym] = df_sym["Close"]
        except Exception as exc:
            logger.debug(f"[shoonya] universe {sym} failed: {exc}")
            failures += 1
        finally:
            time.sleep(0.2)  # ~5 req/sec — within Shoonya fair-use limit

    if not closes:
        logger.warning("[shoonya] universe OHLCV: 0 symbols fetched")
        return None

    out = pd.DataFrame(closes).sort_index()
    logger.info(f"[shoonya] universe OHLCV: {len(closes)}/{len(symbols)} symbols, {failures} failures")
    return out


def get_sector_ohlcv(lookback_days: int = 60) -> Optional[pd.DataFrame]:
    """
    Fetch sector index daily close prices from Shoonya.

    Symbols are internally managed (CNXIT, BANKNIFTY, CNXPHARMA, etc.).
    Returns DataFrame (columns=sector_labels, DatetimeIndex) or None.

    Args:
        lookback_days: Number of calendar days of history to fetch.
    """
    SECTOR_SYMBOLS = {
        "NIFTY_IT":     "CNXIT",
        "NIFTY_BANK":   "BANKNIFTY",
        "NIFTY_PHARMA": "CNXPHARMA",
        "NIFTY_AUTO":   "CNXAUTO",
        "NIFTY_FMCG":   "CNXFMCG",
        "NIFTY_METAL":  "CNXMETAL",
    }
    api = get_shoonya_api()
    if api is None:
        return None

    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    s_str = start.strftime("%d-%m-%Y")
    e_str = end.strftime("%d-%m-%Y")

    closes = {}
    for label, sym in SECTOR_SYMBOLS.items():
        try:
            bars = api.get_daily_price_series(
                exchange="NSE", tradingsymbol=sym, startdate=s_str, enddate=e_str
            )
            if not bars or not isinstance(bars, list):
                continue
            df_sym = _shoonya_bar_to_df(bars)
            if not df_sym.empty:
                closes[label] = df_sym["Close"]
        except Exception as exc:
            logger.debug(f"[shoonya] sector {sym}: {exc}")

    if not closes:
        return None
    return pd.DataFrame(closes).sort_index()


# ─── VIX ─────────────────────────────────────────────────────────────────────

def get_vix_latest() -> Optional[float]:
    """
    Fetch India VIX latest close from Shoonya get_quotes.
    Returns float or None.
    """
    try:
        ret = _api_call("get_quotes", exchange=VIX_EXCH, token=VIX_TOKEN)
        if not ret or ret.get("stat") != "Ok":
            logger.warning(f"[shoonya] VIX get_quotes failed: {ret}")
            return None
        lp = float(ret.get("lp") or ret.get("c") or 0)
        if lp <= 0:
            return None
        return lp
    except Exception as exc:
        logger.error(f"[shoonya] get_vix_latest: {exc}")
        return None


def get_vix_series(lookback_days: int = 30) -> Optional[pd.Series]:
    """
    Fetch India VIX daily close series from Shoonya.
    Returns pd.Series (DatetimeIndex) or None.
    """
    api = get_shoonya_api()
    if api is None:
        return None
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    try:
        bars = api.get_daily_price_series(
            exchange=VIX_EXCH,
            token=VIX_TOKEN,        # "26017"
            startdate=start.strftime("%d-%m-%Y"),
            enddate=end.strftime("%d-%m-%Y"),
        )
        if not bars or not isinstance(bars, list):
            return None
        df = _shoonya_bar_to_df(bars)
        if df.empty or "Close" not in df.columns:
            return None
        return df["Close"]
    except Exception as exc:
        logger.error(f"[shoonya] get_vix_series: {exc}")
        return None


# ─── Options chain / PCR ─────────────────────────────────────────────────────

def get_pcr_oi() -> Optional[dict]:
    """
    Fetch NIFTY option chain from Shoonya and compute PCR OI.
    Returns dict {pcr, total_call_oi, total_put_oi, market_date} or None.

    Shoonya option chain uses get_option_chain(exchange, tradingsymbol, strikeprice, count).
    We fetch a wide strike window and aggregate OI.
    """
    api = get_shoonya_api()
    if api is None:
        return None

    # Get ATM strike from current NIFTY quote
    try:
        q = api.get_quotes(exchange=NIFTY_EXCH, token=NIFTY_TOKEN)
        if not q or q.get("stat") != "Ok":
            logger.warning("[shoonya] PCR: could not get NIFTY quote for ATM")
            return None
        spot = float(q.get("lp") or q.get("c") or 0)
        if spot <= 0:
            return None
        # Round to nearest 50
        atm = round(spot / 50) * 50
    except Exception as exc:
        logger.error(f"[shoonya] PCR ATM lookup: {exc}")
        return None

    try:
        # Fetch option chain — count=20 means 20 strikes each side
        chain = api.get_option_chain(
            exchange="NFO",
            tradingsymbol="NIFTY",
            strikeprice=str(atm),
            count=20,
        )
        if not chain or chain.get("stat") != "Ok":
            logger.warning(f"[shoonya] option chain failed: {chain}")
            return None

        values = chain.get("values", [])
        if not values:
            return None

        total_call = 0.0
        total_put  = 0.0
        for row in values:
            try:
                otype = str(row.get("optt") or row.get("optiontype") or "").upper().strip()
                oi    = float(row.get("oi") or row.get("OI") or 0)
                if otype in ("CE", "C"):
                    total_call += oi
                elif otype in ("PE", "P"):
                    total_put += oi
            except Exception:
                continue

        if total_call == 0:
            logger.warning("[shoonya] PCR: zero call OI — chain may be empty")
            return None

        pcr = total_put / total_call
        return {
            "pcr":           pcr,
            "total_call_oi": total_call,
            "total_put_oi":  total_put,
            "spot":          spot,
            "atm":           atm,
            "market_date":   datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
    except Exception as exc:
        logger.error(f"[shoonya] get_pcr_oi chain processing: {exc}")
        return None


# ─── FII / DII (Shoonya does not expose FII natively — placeholder) ───────────

def get_fii_daily() -> Optional[dict]:
    """
    Shoonya does not expose FII/DII flows directly in its public API.
    This returns None to trigger the secondary NSE/report fallback.
    Kept as explicit stub so the architecture is honest about this limitation.
    """
    logger.info("[shoonya] FII/DII not natively available via Shoonya API → fallback to NSE")
    return None


# ─── Account / Risk ─────────────────────────────────────────────────────────

def get_account_equity() -> Optional[float]:
    """
    Fetch available margin/limits from Shoonya.
    Returns float (cash) or None.
    """
    try:
        ret = _api_call("get_limits")
        if not ret or ret.get("stat") != "Ok":
            logger.warning(f"[shoonya] get_limits failed: {ret}")
            return None
        # 'cash' is the net available margin in Shoonya
        cash = float(ret.get("cash") or 0)
        return cash
    except Exception as exc:
        logger.error(f"[shoonya] get_account_equity: {exc}")
        return None
