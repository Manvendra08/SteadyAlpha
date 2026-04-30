# Shoonya API Integration — Fix Specification

> **Files:** `pipeline/adapters/shoonya_session.py` · `pipeline/adapters/shoonya_market.py`  
> **Review Date:** 2026-04-29  
> **Priority:** P1 = Live-trading risk · P2 = Crash risk · P3 = Design/reliability

---

## FIX-01 · P1 — Midnight-aware Session TTL

**File:** `shoonya_session.py`  
**Problem:** `_SESSION_TTL = 6 * 3600` expires by elapsed time. Shoonya sessions die at **midnight IST** regardless of login time. A session started at 8 PM silently fails after midnight.

### Remove
```python
_SESSION_TTL = 6 * 3600
```

### Add (top of file, after imports)
```python
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo  # Python 3.9+; use pytz if older

_IST = ZoneInfo("Asia/Kolkata")
_SESSION_BUFFER_SEC = 300  # re-login 5 min before midnight

def _session_expired(login_ts: float) -> bool:
    """Return True if session will expire within buffer window."""
    now_ist = datetime.now(_IST)
    midnight_ist = (now_ist + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    secs_to_midnight = (midnight_ist - now_ist).total_seconds()
    return secs_to_midnight < _SESSION_BUFFER_SEC
```

### Update `get_shoonya_api()`
```python
# Replace:
if _logged_in and (now - _login_ts) < _SESSION_TTL and _api is not None:
    return _api

# With:
if _logged_in and _api is not None and not _session_expired(_login_ts):
    return _api
```

---

## FIX-02 · P2 — `susertoken` KeyError Guard

**File:** `shoonya_session.py`  
**Problem:** `ret["susertoken"]` throws `KeyError` on a malformed broker response while holding `_lock`, leaving the singleton in an inconsistent state.

### Replace (in `_safe_login`)
```python
# Replace:
setattr(api, "_NorenApi__susertoken", ret["susertoken"])

# With:
susertoken = ret.get("susertoken", "")
if not susertoken:
    logger.error(f"[shoonya] Login response missing susertoken: {ret}")
    return None
setattr(api, "_NorenApi__susertoken", susertoken)
```

---

## FIX-03 · P2 — Use Token for NIFTY OHLCV

**File:** `shoonya_market.py`  
**Problem:** `get_daily_price_series` for index instruments requires `token=` not `tradingsymbol=`. Using the symbol string silently returns `None` or an empty list.

### Replace in `get_nifty_ohlcv()`
```python
# Replace:
bars = api.get_daily_price_series(
    exchange=NIFTY_EXCH,
    tradingsymbol="NIFTY",
    startdate=start_str,
    enddate=end_str,
)

# With:
bars = api.get_daily_price_series(
    exchange=NIFTY_EXCH,
    token=NIFTY_TOKEN,      # "26000"
    startdate=start_str,
    enddate=end_str,
)
```

---

## FIX-04 · P2 — Use Token for VIX Daily Series

**File:** `shoonya_market.py`  
**Problem:** `get_vix_series` uses `tradingsymbol="INDIAVIX"` but `get_vix_latest` (correct) uses `token="26017"`. The daily series call silently fails.

### Replace in `get_vix_series()`
```python
# Replace:
bars = api.get_daily_price_series(
    exchange=VIX_EXCH,
    tradingsymbol="INDIAVIX",
    startdate=start.strftime("%d-%m-%Y"),
    enddate=end.strftime("%d-%m-%Y"),
)

# With:
bars = api.get_daily_price_series(
    exchange=VIX_EXCH,
    token=VIX_TOKEN,        # "26017"
    startdate=start.strftime("%d-%m-%Y"),
    enddate=end.strftime("%d-%m-%Y"),
)
```

---

## FIX-05 · P3 — Rate Limiter in `get_universe_ohlcv`

**File:** `shoonya_market.py`  
**Problem:** Synchronous per-symbol API loop with no delay. Large universes (50+ symbols) will hit Shoonya's throttle, causing silent failures mid-loop.

### Add import (top of file)
```python
import time
```

### Update loop in `get_universe_ohlcv()`
```python
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
```

---

## FIX-06 · P3 — Fix `get_sector_ohlcv` Signature Mismatch

**File:** `shoonya_market.py`  
**Problem:** Module docstring declares `get_sector_ohlcv(symbols, days)` but the actual signature is `get_sector_ohlcv(lookback_days)` with hardcoded symbols. Callers passing `symbols` will break.

### Update function signature and docstring
```python
def get_sector_ohlcv(lookback_days: int = 60) -> Optional[pd.DataFrame]:
    """
    Fetch sector index daily close prices from Shoonya.

    Symbols are internally managed (CNXIT, BANKNIFTY, CNXPHARMA, etc.).
    Returns DataFrame (columns=sector_labels, DatetimeIndex) or None.

    Args:
        lookback_days: Number of calendar days of history to fetch.
    """
```

### Update module-level docstring
```python
# Replace:
# - get_sector_ohlcv(symbols, days) → pd.DataFrame

# With:
# - get_sector_ohlcv(lookback_days) → pd.DataFrame  [symbols managed internally]
```

---

## FIX-07 · P3 — Verify `optt` Field Name in PCR Chain

**File:** `shoonya_market.py`  
**Problem:** Shoonya option chain responses return either `"optt"` or `"optiontype"` depending on SDK version. Current code only checks `"optt"`, silently zeroing OI if the key name differs.

### Replace in `get_pcr_oi()` loop
```python
# Replace:
otype = str(row.get("optt", "")).upper()

# With:
otype = str(row.get("optt") or row.get("optiontype") or "").upper().strip()
```

---

## FIX-08 · P3 — HTTP Transient Error Retry Before Cooldown

**File:** `shoonya_session.py`  
**Problem:** A single transient HTTP error (timeout, DNS blip) triggers `_FAILURE_COOLDOWN` (120s lock-out). Legitimate sessions fail for 2 minutes on a 1-second network glitch.

### Update `_safe_login()` call site in `get_shoonya_api()`
```python
MAX_TRANSIENT_RETRIES = int(os.getenv("SHOONYA_LOGIN_RETRIES", "2"))
RETRY_DELAY_SEC = float(os.getenv("SHOONYA_LOGIN_RETRY_DELAY", "3"))

ret = None
api = None
for host, websocket in _host_pairs():
    for attempt in range(1, MAX_TRANSIENT_RETRIES + 1):
        api = _ShoonyaApi()
        api._NorenApi__service_config["host"] = host
        api._NorenApi__service_config["websocket_endpoint"] = websocket
        ret = _safe_login(api, creds, two_fa, host)
        if ret is not None:
            break
        if attempt < MAX_TRANSIENT_RETRIES:
            logger.warning(f"[shoonya] Login attempt {attempt} failed, retrying in {RETRY_DELAY_SEC}s")
            time.sleep(RETRY_DELAY_SEC)
    if ret is not None:
        break
```

---

## FIX-09 · Advisory — April 2026 OAuth Compatibility

**File:** `shoonya_session.py`  
**Problem:** Shoonya enforced OAuth + IP whitelisting for retail API from April 2026. `QuickAuth` may still work for **vendor/partner credentials** but needs explicit verification.

### Action Items (not code — needs confirmation)

| Check | How |
|---|---|
| Confirm `QuickAuth` still active for your vendor account | POST to `QuickAuth`, verify `200 OK` with `stat=Ok` |
| If `QuickAuth` deprecated → migrate to OAuth token flow | Use `access_token` from OAuth in place of `susertoken` |
| Add static IP of deployment server to Shoonya whitelist | Prism portal → API Key → IP Whitelist |

### If OAuth migration required, update `_safe_login` token injection
```python
# OAuth flow sets access_token instead of susertoken
setattr(api, "_NorenApi__susertoken", oauth_access_token)
```

---

## Env Variables Reference

All configurable values — no hardcoding needed:

| Variable | Default | Description |
|---|---|---|
| `SHOONYA_USER` | — | Client ID (required) |
| `SHOONYA_PASSWORD` | — | Login password (required) |
| `SHOONYA_API_KEY` | — | API key from Prism (required) |
| `SHOONYA_VENDOR_CODE` | — | Vendor code from Prism (required) |
| `SHOONYA_IMEI` | — | Device IMEI / identifier (required) |
| `SHOONYA_TOTP_SECRET` | — | Base32 TOTP secret (preferred) |
| `SHOONYA_TOTP_VALUE` | — | Static TOTP if no secret (fallback) |
| `SHOONYA_HOST` | `https://api.shoonya.com/NorenWClientTP/` | REST endpoint |
| `SHOONYA_WEBSOCKET` | `wss://api.shoonya.com/NorenWSTP/` | WebSocket endpoint |
| `SHOONYA_ENABLE_LEGACY_HOST_FALLBACK` | `false` | Enable old endpoint fallback |
| `SHOONYA_LOGIN_TIMEOUT_SEC` | `15` | HTTP timeout for login |
| `SHOONYA_LOGIN_FAILURE_COOLDOWN_SEC` | `120` | Lock-out after failure |
| `SHOONYA_LOGIN_RETRIES` | `2` | Transient retry attempts (FIX-08) |
| `SHOONYA_LOGIN_RETRY_DELAY` | `3` | Seconds between retries (FIX-08) |

---

## Fix Checklist

| ID | File | Priority | Type | Status |
|---|---|---|---|---|
| FIX-01 | `shoonya_session.py` | P1 | Midnight TTL | ☐ |
| FIX-02 | `shoonya_session.py` | P2 | susertoken guard | ☐ |
| FIX-03 | `shoonya_market.py` | P2 | NIFTY token param | ☐ |
| FIX-04 | `shoonya_market.py` | P2 | VIX token param | ☐ |
| FIX-05 | `shoonya_market.py` | P3 | Rate limiter | ☐ |
| FIX-06 | `shoonya_market.py` | P3 | Signature mismatch | ☐ |
| FIX-07 | `shoonya_market.py` | P3 | optt field fallback | ☐ |
| FIX-08 | `shoonya_session.py` | P3 | Transient retry | ☐ |
| FIX-09 | `shoonya_session.py` | Advisory | OAuth migration | ☐ |
