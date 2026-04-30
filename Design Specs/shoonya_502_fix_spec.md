# Shoonya 502 Fix Specification

> **Trigger:** `[shoonya] Login HTTP 502 via https://api.shoonya.com/NorenWClientTP/`  
> **Root Cause:** 3 compounding issues — OAuth migration, wrong API key format, invalid IMEI  
> **Date:** 2026-04-29

---

## FIX-A · Critical — Migrate `_safe_login` to OAuth Token Flow

**File:** `pipeline/adapters/shoonya_session.py`  
**Reason:** `QuickAuth` endpoint is 502'ing post April 2026 OAuth migration. The 64-char `SHOONYA_API_KEY` is an OAuth client secret, not a SHA256 `appkey` input.

### Step 1 — Add OAuth token exchange function

```python
import hashlib
import json
import logging
import os
import time
import threading
import requests
from typing import Optional

_OAUTH_TOKEN_URL = "https://api.shoonya.com/oauth/token"
_OAUTH_AUTH_URL  = "https://api.shoonya.com/oauth/auth"

def _get_oauth_access_token(creds: dict, totp: str) -> Optional[str]:
    """
    Full OAuth flow:
      1. POST credentials to auth endpoint → get auth_code
      2. Compute SHA256 checksum
      3. POST checksum + code to token endpoint → get access_token

    Returns access_token string or None on failure.
    """
    user        = creds["SHOONYA_USER"]
    password    = creds["SHOONYA_PASSWORD"]
    api_key     = creds["SHOONYA_API_KEY"]      # 64-char OAuth client secret
    vendor_code = creds["SHOONYA_VENDOR_CODE"]
    redirect_uri = os.getenv("SHOONYA_REDIRECT_URI", "https://www.google.com")

    # ── Step 1: Get auth code ─────────────────────────────────────────────
    auth_payload = {
        "source":     "API",
        "apkversion": "1.0.0",
        "uid":        user,
        "pwd":        hashlib.sha256(password.encode()).hexdigest(),
        "factor2":    totp,
        "vc":         vendor_code,
        "imei":       creds["SHOONYA_IMEI"],
        "redirect_uri": redirect_uri,
    }
    try:
        resp = requests.post(
            _OAUTH_AUTH_URL,
            data="jData=" + json.dumps(auth_payload),
            timeout=float(os.getenv("SHOONYA_LOGIN_TIMEOUT_SEC", "15")),
        )
    except requests.RequestException as exc:
        logger.error(f"[shoonya] OAuth auth request failed: {exc}")
        return None

    if resp.status_code != 200:
        logger.error(f"[shoonya] OAuth auth HTTP {resp.status_code}: {resp.text[:120]!r}")
        return None
    try:
        auth_resp = resp.json()
    except ValueError:
        logger.error(f"[shoonya] OAuth auth non-JSON: {resp.text[:120]!r}")
        return None

    auth_code = auth_resp.get("code") or auth_resp.get("auth_code")
    if not auth_code:
        logger.error(f"[shoonya] OAuth auth_code missing: {auth_resp}")
        return None

    # ── Step 2: Compute checksum ─────────────────────────────────────────
    checksum_raw = f"{user}{api_key}{auth_code}"
    checksum = hashlib.sha256(checksum_raw.encode()).hexdigest()

    # ── Step 3: Exchange code for access_token ────────────────────────────
    token_payload = {
        "code":     auth_code,
        "checksum": checksum,
    }
    try:
        tresp = requests.post(
            _OAUTH_TOKEN_URL,
            json=token_payload,
            headers={"Authorization": f"Bearer {checksum}"},
            timeout=float(os.getenv("SHOONYA_LOGIN_TIMEOUT_SEC", "15")),
        )
    except requests.RequestException as exc:
        logger.error(f"[shoonya] OAuth token request failed: {exc}")
        return None

    if tresp.status_code != 200:
        logger.error(f"[shoonya] OAuth token HTTP {tresp.status_code}: {tresp.text[:120]!r}")
        return None
    try:
        token_resp = tresp.json()
    except ValueError:
        logger.error(f"[shoonya] OAuth token non-JSON: {tresp.text[:120]!r}")
        return None

    access_token = token_resp.get("access_token") or token_resp.get("susertoken")
    if not access_token:
        logger.error(f"[shoonya] access_token missing in response: {token_resp}")
        return None

    logger.info(f"[shoonya] OAuth token acquired for uid={user}")
    return access_token
```

### Step 2 — Replace `_safe_login` call in `get_shoonya_api()`

```python
# REMOVE this block entirely:
ret = None
api = None
for host, websocket in _host_pairs():
    api = _ShoonyaApi()
    ...
    ret = _safe_login(api, creds, two_fa, host)
    if ret is not None:
        break

# REPLACE WITH:
access_token = _get_oauth_access_token(creds, two_fa)
if not access_token:
    _logged_in = False
    _last_failure_ts = now
    _last_failure_msg = "OAuth token acquisition failed"
    return None

api = _ShoonyaApi()
# Inject OAuth token as susertoken — NorenApi reads this for all subsequent calls
setattr(api, "_NorenApi__username",    creds["SHOONYA_USER"])
setattr(api, "_NorenApi__accountid",   creds["SHOONYA_USER"])
setattr(api, "_NorenApi__password",    creds["SHOONYA_PASSWORD"])
setattr(api, "_NorenApi__susertoken",  access_token)

_api = api
_logged_in = True
_login_ts = now
_last_failure_ts = 0.0
_last_failure_msg = ""
logger.info(f"[shoonya] OAuth login OK — uid={creds['SHOONYA_USER']}")
return _api
```

---

## FIX-B · Critical — Correct `.env` Values

**File:** `file.env`

### Current state (broken)
```env
SHOONYA_API_KEY=bf1868d88e0d7abb8709c49544972219  # ← commented out (old QuickAuth key)
SHOONYA_API_KEY=q3idKOCfhimIC3DR48NDMjb4eDpfxIYpeXKQjjRxOIIMcD8flb7FoNQ4FboYi2O8  # ← OAuth secret (correct)
SHOONYA_VENDOR_CODE=FA369105_U  # ← set to User ID, may differ from actual vendor code
SHOONYA_IMEI=abc1234            # ← placeholder, rejected by broker
```

### Fixed `.env` block
```env
# Remove the old commented key entirely — only one SHOONYA_API_KEY allowed
SHOONYA_API_KEY=q3idKOCfhimIC3DR48NDMjb4eDpfxIYpeXKQjjRxOIIMcD8flb7FoNQ4FboYi2O8

# Vendor code — verify this in Prism portal → API Key page
# If your account is self-vendor, FA369105_U is correct
SHOONYA_VENDOR_CODE=FA369105_U

# IMEI — use your machine MAC address (no colons/dashes), or any consistent string
# registered against your API key in Prism
SHOONYA_IMEI=<YOUR_REGISTERED_IMEI_OR_MAC>

# OAuth redirect URI — must match what is configured in Prism portal
SHOONYA_REDIRECT_URI=https://www.google.com

# Optional: enable legacy fallback for debugging
SHOONYA_ENABLE_LEGACY_HOST_FALLBACK=false
```

### How to get your correct IMEI
```bash
# Linux/Mac — get MAC without colons
ip link show | grep ether | awk '{print $2}' | tr -d ':' | head -1

# Windows
getmac /fo csv /nh | head -1 | tr -d ',"' | tr -d ' '
```

---

## FIX-C · Medium — Dual-Mode Fallback (QuickAuth + OAuth)

**File:** `pipeline/adapters/shoonya_session.py`  
**Reason:** Some vendor accounts may still support QuickAuth. A mode flag avoids hard-coupling to OAuth only.

```python
# Add to .env:
# SHOONYA_AUTH_MODE=oauth     # "oauth" (default) or "quickauth"

def _login_with_mode(api, creds: dict, two_fa: str) -> Optional[str]:
    """
    Returns susertoken/access_token or None.
    Tries mode from env; falls back to alternate on 502.
    """
    mode = os.getenv("SHOONYA_AUTH_MODE", "oauth").lower()

    if mode == "oauth":
        token = _get_oauth_access_token(creds, two_fa)
        if token:
            return token
        # Fallback to QuickAuth if OAuth fails and fallback is enabled
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
    for host, _ in _host_pairs():
        ret = _safe_login(_ShoonyaApi(), creds, two_fa, host)
        if ret:
            return ret.get("susertoken")
    return None
```

### Updated env flags
```env
SHOONYA_AUTH_MODE=oauth              # switch to "quickauth" to test legacy path
SHOONYA_QUICKAUTH_FALLBACK=false     # set true to auto-fallback if OAuth fails
```

---

## FIX-D · Medium — Diagnostic Endpoint Probe

Add a pre-login health check to distinguish broker downtime from auth failures:

```python
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
```

### Use in `get_shoonya_api()` before login attempt
```python
primary_host = _host_pairs()[0][0]
if not _probe_endpoint(primary_host):
    logger.warning(f"[shoonya] Endpoint unreachable: {primary_host} — skipping login, no cooldown set")
    # Do NOT set _last_failure_ts here — infrastructure outage, not auth failure
    return None
```

---

## Updated `.env` — Full Shoonya Block

```env
# ── Shoonya Credentials ───────────────────────────────────────────────────────
SHOONYA_USER=FA369105_U
SHOONYA_PASSWORD=Iamok@5678
SHOONYA_API_KEY=q3idKOCfhimIC3DR48NDMjb4eDpfxIYpeXKQjjRxOIIMcD8flb7FoNQ4FboYi2O8
SHOONYA_VENDOR_CODE=FA369105_U
SHOONYA_IMEI=<REGISTERED_MAC_OR_IMEI>
SHOONYA_TOTP_SECRET=DCKRK73NFWSF3RTWASP25GW4FK7BSO4K

# ── Shoonya Endpoints ─────────────────────────────────────────────────────────
SHOONYA_HOST=https://api.shoonya.com/NorenWClientTP/
SHOONYA_WEBSOCKET=wss://api.shoonya.com/NorenWSTP/
SHOONYA_ENABLE_LEGACY_HOST_FALLBACK=false

# ── Shoonya OAuth ─────────────────────────────────────────────────────────────
SHOONYA_AUTH_MODE=oauth
SHOONYA_REDIRECT_URI=https://www.google.com
SHOONYA_QUICKAUTH_FALLBACK=false

# ── Shoonya Tuning ────────────────────────────────────────────────────────────
SHOONYA_LOGIN_TIMEOUT_SEC=15
SHOONYA_LOGIN_FAILURE_COOLDOWN_SEC=120
SHOONYA_LOGIN_RETRIES=2
SHOONYA_LOGIN_RETRY_DELAY=3
```

---

## Verification Steps

After applying fixes:

```bash
# 1. Confirm TOTP is generating correctly
python3 -c "import pyotp; print(pyotp.TOTP('DCKRK73NFWSF3RTWASP25GW4FK7BSO4K').now())"

# 2. Probe broker endpoint
curl -o /dev/null -w "%{http_code}" https://api.shoonya.com/NorenWClientTP/

# 3. Test OAuth auth step manually
curl -X POST https://api.shoonya.com/oauth/auth \
  -d 'jData={"source":"API","uid":"FA369105_U","pwd":"<SHA256_PASSWORD>","factor2":"<TOTP>","vc":"FA369105_U","imei":"<IMEI>","redirect_uri":"https://www.google.com"}'

# 4. Run session bootstrap
python3 -c "from pipeline.adapters.shoonya_session import get_shoonya_api; api = get_shoonya_api(); print('OK' if api else 'FAILED')"
```

---

## Fix Checklist

| ID | Description | File | Priority | Status |
|---|---|---|---|---|
| FIX-A | Migrate to OAuth token flow | `shoonya_session.py` | P1 | ☐ |
| FIX-B | Correct `.env` — IMEI + key cleanup | `file.env` | P1 | ☐ |
| FIX-C | Dual-mode auth fallback | `shoonya_session.py` | P2 | ☐ |
| FIX-D | Endpoint probe before login | `shoonya_session.py` | P2 | ☐ |
