"""
pipeline/adapters/shoonya_session.py
Shoonya (Finvasia) API session bootstrap.
Singleton pattern — one login per pipeline run.
Auth requires: SHOONYA_USER, SHOONYA_PASSWORD, SHOONYA_API_KEY,
               SHOONYA_VENDOR_CODE, SHOONYA_IMEI, SHOONYA_TOTP_SECRET (optional)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

import requests

logger = logging.getLogger(__name__)



_lock       = threading.Lock()
_api        = None          # NorenApi instance
_logged_in  = False
_login_ts   = 0.0
_last_failure_ts = 0.0
_last_failure_msg = ""
_IST = ZoneInfo("Asia/Kolkata")
_SESSION_BUFFER_SEC = 300  # re-login 5 min before midnight
_FAILURE_COOLDOWN = int(os.getenv("SHOONYA_LOGIN_FAILURE_COOLDOWN_SEC", "120"))

def _session_expired(login_ts: float) -> bool:
    """Return True if session will expire within buffer window."""
    now_ist = datetime.now(_IST)
    midnight_ist = (now_ist + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    secs_to_midnight = (midnight_ist - now_ist).total_seconds()
    return secs_to_midnight < _SESSION_BUFFER_SEC

_DEFAULT_HOST = "https://api.shoonya.com/NorenWClientTP/"
_DEFAULT_WS = "wss://api.shoonya.com/NorenWSTP/"
_LEGACY_HOST = "https://shoonyatrade.finvasia.com/NorenWClientTP/"
_LEGACY_WS = "wss://shoonyatrade.finvasia.com/NorenWSTP/"

# ─── Credential helpers ───────────────────────────────────────────────────────

def _get_creds() -> dict:
    """Read Shoonya creds from env.  Returns {} if any required key missing."""
    keys = ["SHOONYA_USER", "SHOONYA_PASSWORD", "SHOONYA_API_KEY",
            "SHOONYA_VENDOR_CODE", "SHOONYA_IMEI"]
    creds = {k: os.environ.get(k, "") for k in keys}
    creds["SHOONYA_TOTP_SECRET"] = os.environ.get("SHOONYA_TOTP_SECRET", "")
    creds["SHOONYA_TOTP_VALUE"] = os.environ.get("SHOONYA_TOTP_VALUE", "")
    if any(not creds[k] for k in keys):
        return {}
    return creds


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _make_totp(secret: str) -> str:
    """Generate TOTP from base32 secret. Returns '' if pyotp not available."""
    if not secret:
        return ""
    try:
        import pyotp
        return pyotp.TOTP(secret).now()
    except ImportError:
        logger.warning("[shoonya] pyotp not installed — TOTP unavailable")
        return ""

# ─── Session bootstrap ────────────────────────────────────────────────────────

def _host_pairs() -> list[tuple[str, str]]:
    """Return Shoonya REST/WS endpoints to try, in order."""
    host = os.getenv("SHOONYA_HOST", _DEFAULT_HOST).strip()
    ws = os.getenv("SHOONYA_WEBSOCKET", _DEFAULT_WS).strip()
    pairs = [(host, ws)]

    # Current official endpoint is api.shoonya.com. Legacy fallback is opt-in.
    if os.getenv("SHOONYA_ENABLE_LEGACY_HOST_FALLBACK", "false").lower() == "true":
        pairs.append((_LEGACY_HOST, _LEGACY_WS))

    out: list[tuple[str, str]] = []
    seen = set()
    for h, w in pairs:
        h = h.rstrip("/") + "/"
        w = w.rstrip("/") + "/"
        if h not in seen:
            out.append((h, w))
            seen.add(h)
    return out


def _probe_endpoint(host: str) -> bool:
    """
    Returns True if the broker endpoint is reachable.
    Avoids triggering failure cooldown for infrastructure outages.
    """
    try:
        r = requests.get(
            host.rstrip("/"),
            timeout=5,
            allow_redirects=False
        )
        # 404 is fine — means server is up, path just doesn't exist as GET
        return r.status_code in (200, 301, 302, 404, 405)
    except requests.RequestException:
        return False





def _login_with_mode(creds: dict, two_fa: str) -> Optional[str]:
    """
    Returns susertoken/access_token or None.
    Tries mode from env; falls back to alternate if enabled.
    """
    mode = os.getenv("SHOONYA_AUTH_MODE", "oauth").lower()

    if mode == "oauth":
        try:
            from pipeline.adapters.shoonya_oauth import get_shoonya_token_oauth
            token = get_shoonya_token_oauth()
        except Exception as exc:
            logger.error(f"[shoonya] OAuth process failed: {exc}")
            token = None

        if token:
            return token
        if os.getenv("SHOONYA_QUICKAUTH_FALLBACK", "false").lower() == "true":
            logger.warning("[shoonya] OAuth failed, attempting QuickAuth fallback")
            return _try_quickauth(creds, two_fa)
        return None

    elif mode == "quickauth":
        return _try_quickauth(creds, two_fa)

    logger.error(f"[shoonya] Unknown SHOONYA_AUTH_MODE: {mode}")
    return None


def _try_quickauth(creds: dict, two_fa: str) -> Optional[str]:
    """Legacy QuickAuth path — returns susertoken or None."""
    from NorenRestApiPy.NorenApi import NorenApi # type: ignore
    api = NorenApi(host=_DEFAULT_HOST, websocket=_DEFAULT_WS)
    for host, _ in _host_pairs():
        ret = _safe_login(api, creds, two_fa, host)
        if ret:
            return ret.get("susertoken")
    return None


def _safe_login(api: object, creds: dict, two_fa: str, host: str) -> Optional[dict]:
    """
    Safe replacement for NorenApi.login.
    The SDK blindly json.loads() every response; an HTML 502 page raises
    JSONDecodeError and logs noisy HTML. This treats non-JSON / HTTP failures
    as broker unavailability and lets ingestion fall back cleanly.
    """
    url = f"{host.rstrip('/')}/QuickAuth"
    payload = {
        "source": "API",
        "apkversion": "1.0.0",
        "uid": creds["SHOONYA_USER"],
        "pwd": _sha256(creds["SHOONYA_PASSWORD"]),
        "factor2": two_fa,
        "vc": creds["SHOONYA_VENDOR_CODE"],
        "appkey": _sha256(f"{creds['SHOONYA_USER']}|{creds['SHOONYA_API_KEY']}"),
        "imei": creds["SHOONYA_IMEI"],
    }

    try:
        response = requests.post(
            url,
            data="jData=" + json.dumps(payload),
            timeout=float(os.getenv("SHOONYA_LOGIN_TIMEOUT_SEC", "15")),
        )
    except requests.RequestException as exc:
        logger.error(f"[shoonya] Login transport error via {host}: {exc}")
        return None

    content_type = response.headers.get("content-type", "")
    if response.status_code != 200:
        preview = response.text[:120].replace("\n", " ")
        logger.error(
            f"[shoonya] Login HTTP {response.status_code} via {host}; "
            f"content_type={content_type or 'unknown'}; body={preview!r}"
        )
        return None

    try:
        ret = response.json()
    except ValueError:
        preview = response.text[:120].replace("\n", " ")
        logger.error(
            f"[shoonya] Login returned non-JSON via {host}; "
            f"content_type={content_type or 'unknown'}; body={preview!r}"
        )
        return None

    if ret.get("stat") != "Ok":
        logger.error(f"[shoonya] Login failed via {host}: {ret.get('emsg', ret)}")
        return None

    # NorenApi methods read these private attrs after login.
    setattr(api, "_NorenApi__username", creds["SHOONYA_USER"])
    setattr(api, "_NorenApi__accountid", creds["SHOONYA_USER"])
    setattr(api, "_NorenApi__password", creds["SHOONYA_PASSWORD"])
    
    susertoken = ret.get("susertoken", "")
    if not susertoken:
        logger.error(f"[shoonya] Login response missing susertoken: {ret}")
        return None
    setattr(api, "_NorenApi__susertoken", susertoken)
    return ret


def get_shoonya_api() -> Optional[object]:
    """
    Return an authenticated NorenApi instance, or None if auth unavailable.
    Thread-safe singleton with TTL refresh.
    """
    global _api, _logged_in, _login_ts, _last_failure_ts, _last_failure_msg

    with _lock:
        # Deactivated for Phase 1
        return None

        if _last_failure_ts and (now - _last_failure_ts) < _FAILURE_COOLDOWN:
            remaining = int(_FAILURE_COOLDOWN - (now - _last_failure_ts))
            logger.warning(
                f"[shoonya] Login suppressed for {remaining}s after prior failure"
                + (f": {_last_failure_msg}" if _last_failure_msg else "")
            )
            return None

        creds = _get_creds()
        if not creds:
            logger.warning(
                "[shoonya] Credentials not set. "
                "Set SHOONYA_USER / SHOONYA_PASSWORD / SHOONYA_API_KEY / "
                "SHOONYA_VENDOR_CODE / SHOONYA_IMEI in environment."
            )
            return None

        try:
            from NorenRestApiPy.NorenApi import NorenApi  # type: ignore

            class _ShoonyaApi(NorenApi):
                def __init__(self):
                    super().__init__(
                        host=_DEFAULT_HOST,
                        websocket=_DEFAULT_WS,
                    )

            totp = _make_totp(creds["SHOONYA_TOTP_SECRET"])
            two_fa = totp or creds.get("SHOONYA_TOTP_VALUE", "")
            if not two_fa:
                logger.error("[shoonya] Missing TOTP. Set SHOONYA_TOTP_SECRET or SHOONYA_TOTP_VALUE.")
                _logged_in = False
                _last_failure_ts = now
                _last_failure_msg = "missing TOTP"
                return None

            # ── FIX-D: Diagnostic Probe ──
            primary_host = _host_pairs()[0][0]
            if not _probe_endpoint(primary_host):
                logger.warning(f"[shoonya] Endpoint unreachable: {primary_host} — skipping login, no cooldown set")
                return None

            # ── FIX-A/C: OAuth / Dual-Mode Auth ──
            token = _login_with_mode(creds, two_fa)
            if not token:
                _logged_in = False
                _last_failure_ts = now
                _last_failure_msg = "authentication failed (OAuth/QuickAuth)"
                return None

            api = _ShoonyaApi()
            # Inject token as susertoken — NorenApi reads this for all subsequent calls
            setattr(api, "_NorenApi__username",    creds["SHOONYA_USER"])
            setattr(api, "_NorenApi__accountid",   creds["SHOONYA_USER"])
            setattr(api, "_NorenApi__password",    creds["SHOONYA_PASSWORD"])
            setattr(api, "_NorenApi__susertoken",  token)

            _api      = api
            _logged_in = True
            _login_ts  = now
            _last_failure_ts = 0.0
            _last_failure_msg = ""
            logger.info(f"[shoonya] Login OK — uid={creds['SHOONYA_USER']}")
            return _api

        except ImportError:
            logger.error("[shoonya] NorenRestApiPy not installed")
            return None
        except Exception as exc:
            logger.error(f"[shoonya] Login exception: {exc}")
            _logged_in = False
            _last_failure_ts = now
            _last_failure_msg = str(exc)
            return None


def shoonya_available() -> bool:
    """Quick check — returns True if a valid session exists."""
    return get_shoonya_api() is not None
