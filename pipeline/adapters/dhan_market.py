"""
pipeline/adapters/dhan_market.py
Dhan wrappers for market data.
"""

from __future__ import annotations

import logging
from typing import Optional
import pandas as pd
from datetime import datetime, timezone, timedelta
from pipeline.adapters.dhan_session import get_dhan_api

logger = logging.getLogger(__name__)

def get_nifty_ohlcv(lookback_days: int = 400) -> Optional[pd.DataFrame]:
    api = get_dhan_api()
    if not api: return None
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    try:
        req = api.historical_daily_data(
            symbol='Nifty 50',
            exchange_segment='IDX_I',
            instrument_type='INDEX',
            expiry_code=0,
            from_date=start.strftime("%Y-%m-%d"),
            to_date=end.strftime("%Y-%m-%d")
        )
        if req['status'] == 'success':
            data = req['data']
            df = pd.DataFrame(data)
            df['start_Time'] = pd.to_datetime(df['start_Time'])
            df.set_index('start_Time', inplace=True)
            df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
            return df
        return None
    except Exception as exc:
        logger.warning(f"[dhan] nifty ohlcv failed: {exc}")
        return None

def get_universe_ohlcv(symbols: list[str], lookback_days: int = 90) -> Optional[pd.DataFrame]:
    api = get_dhan_api()
    if not api: return None
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    closes = {}
    for sym in symbols:
        try:
            req = api.historical_daily_data(
                symbol=sym,
                exchange_segment='NSE_EQ',
                instrument_type='EQUITY',
                expiry_code=0,
                from_date=start.strftime("%Y-%m-%d"),
                to_date=end.strftime("%Y-%m-%d")
            )
            if req['status'] == 'success' and req['data']:
                df = pd.DataFrame(req['data'])
                df['start_Time'] = pd.to_datetime(df['start_Time'])
                df.set_index('start_Time', inplace=True)
                closes[sym] = df['close']
        except Exception:
            pass
    if not closes: return None
    return pd.DataFrame(closes).sort_index()

def get_sector_ohlcv(lookback_days: int = 60) -> Optional[pd.DataFrame]:
    SECTOR_SYMBOLS = {
        "NIFTY_IT":     "Nifty IT",
        "NIFTY_BANK":   "Nifty Bank",
        "NIFTY_PHARMA": "Nifty Pharma",
        "NIFTY_AUTO":   "Nifty Auto",
        "NIFTY_FMCG":   "Nifty FMCG",
        "NIFTY_METAL":  "Nifty Metal",
    }
    api = get_dhan_api()
    if not api: return None
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    closes = {}
    for label, sym in SECTOR_SYMBOLS.items():
        try:
            req = api.historical_daily_data(
                symbol=sym,
                exchange_segment='IDX_I',
                instrument_type='INDEX',
                expiry_code=0,
                from_date=start.strftime("%Y-%m-%d"),
                to_date=end.strftime("%Y-%m-%d")
            )
            if req['status'] == 'success' and req['data']:
                df = pd.DataFrame(req['data'])
                df['start_Time'] = pd.to_datetime(df['start_Time'])
                df.set_index('start_Time', inplace=True)
                closes[label] = df['close']
        except Exception:
            pass
    if not closes: return None
    return pd.DataFrame(closes).sort_index()

def get_vix_latest() -> Optional[float]:
    api = get_dhan_api()
    if not api: return None
    try:
        # For simplicity, returning None triggers the fallback yfinance
        return None
    except Exception:
        return None

def get_vix_series(lookback_days: int = 30) -> Optional[pd.Series]:
    api = get_dhan_api()
    if not api: return None
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    try:
        req = api.historical_daily_data(
            symbol='India VIX',
            exchange_segment='IDX_I',
            instrument_type='INDEX',
            expiry_code=0,
            from_date=start.strftime("%Y-%m-%d"),
            to_date=end.strftime("%Y-%m-%d")
        )
        if req['status'] == 'success' and req['data']:
            df = pd.DataFrame(req['data'])
            df['start_Time'] = pd.to_datetime(df['start_Time'])
            df.set_index('start_Time', inplace=True)
            return df['close']
        return None
    except Exception:
        return None

def get_pcr_oi() -> Optional[dict]:
    # Placeholder for Dhan. If Dhan doesn't have a direct PCR endpoint, return None to fallback
    return None

def get_account_equity() -> Optional[float]:
    api = get_dhan_api()
    if not api: return None
    try:
        fund = api.get_fund_limits()
        if fund and 'data' in fund and fund['status'] == 'success':
            return float(fund['data'].get('availabelBalance', 0))
        return None
    except Exception:
        return None
