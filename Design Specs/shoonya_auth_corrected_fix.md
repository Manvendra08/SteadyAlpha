# Shoonya Auth Fix — Corrected Specification

> **Previous Error:** FIX-A incorrectly POSTed to `/oauth/auth` — this is a browser redirect URL, not a REST endpoint → 404  
> **Root Cause Clarified:** Shoonya OAuth requires a **browser login step** to get the `auth_code`. Two valid paths below.

---

## Context — Two Valid Auth Paths

| Path | Key Used | Mechanism | Status |
|---|---|---|---|
| **QuickAuth** | 32-char API key (`bf1868...`) | Direct REST POST | Was 502 — investigate |
| **OAuth** | 64-char secret (`q3idKO...`) | Browser → auth_code → token exchange | Correct approach |

The `.env` has **both keys** — old one commented out. The root cause of original 502 was likely `QuickAuth` receiving the **64-char OAuth secret** in the `appkey` field instead of the 32-char API key.

---

## PATH 1 — Fix QuickAuth (Simpler, Test First)

### What was wrong
```python
# _safe_login() was computing:
appkey = SHA256(f"{user}|{SHOONYA_API_KEY}")

# SHOONYA_API_KEY was the 64-char OAuth secret → wrong key for QuickAuth
# QuickAuth needs the Prism API key (32-char) in the appkey hash
```

### Fix `.env` — separate the two keys
```env
# For QuickAuth (SHA256 appkey input)
SHOONYA_API_KEY=bf1868d88e0d7abb8709c49544972219

# For OAuth checksum (SHA256 of client_id + secret_code + auth_code)
SHOONYA_OAUTH_SECRET=q3idKOCfhimIC3DR48NDMjb4eDpfxIYpeXKQjjRxOIIMcD8flb7FoNQ4FboYi2O8
```

### Test QuickAuth directly
```bash
# Step 1: Generate values
TOTP=$(python3 -c "import pyotp; print(pyotp.TOTP('DCKRK73NFWSF3RTWASP25GW4FK7BSO4K').now())")
PWD_HASH=$(echo -n "Iamok@5678" | sha256sum | awk '{print $1}')
APP_KEY=$(echo -n "FA369105_U|bf1868d88e0d7abb8709c49544972219" | sha256sum | awk '{print $1}')

echo "TOTP: $TOTP"
echo "pwd_hash: $PWD_HASH"
echo "app_key: $APP_KEY"

# Step 2: Fire QuickAuth
curl -X POST https://api.shoonya.com/NorenWClientTP/QuickAuth \
  -d "jData={
    \"source\":\"API\",
    \"apkversion\":\"1.0.0\",
    \"uid\":\"FA369105_U\",
    \"pwd\":\"$PWD_HASH\",
    \"factor2\":\"$TOTP\",
    \"vc\":\"FA369105_U\",
    \"appkey\":\"$APP_KEY\",
    \"imei\":\"abc1234\"
  }"
```

**Expected responses:**
- `{"stat":"Ok","susertoken":"..."}` → QuickAuth works, update `_safe_login` to use `SHOONYA_API_KEY` (32-char)
- `{"stat":"Not_Ok","emsg":"Invalid Credentials"}` → Wrong key/TOTP, debug creds
- `502` again → QuickAuth is dead for your account, use PATH 2

---

## PATH 2 — OAuth with Playwright (Browser Automation)

**Use when:** QuickAuth returns 502 or `API not supported`.

### How Shoonya OAuth actually works

```
Step 1 (Browser):  GET https://api.shoonya.com/oauth/auth
                       ?response_type=code
                       &client_id=FA369105_U
                       &redirect_uri=https://www.google.com
                   → User logs in → browser redirects to google.com?code=XXXXX

Step 2 (REST):     Compute checksum = SHA256(client_id + oauth_secret + code)
                   POST https://api.shoonya.com/NorenWClientTP/GetToken  ← correct token URL
                       Body: { "code": "XXXXX", "checksum": "..." }
                   → Returns { "susertoken": "...", "access_token": "..." }
```

### Install Playwright
```bash
pip install playwright
playwright install chromium
```

### `shoonya_oauth.py` — headless auth code extractor

```python
"""
shoonya_oauth.py
Automates Shoonya OAuth browser login to extract auth_code,
then exchanges it for an access_token via REST.
"""
import hashlib
import os
import json
import logging
import requests
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_AUTH_URL   = "https://api.shoonya.com/oauth/auth"
_TOKEN_URL  = "https://api.shoonya.com/NorenWClientTP/GetToken"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def get_auth_code_headless(
    client_id: str,
    password: str,
    totp: str,
    oauth_secret: str,
    redirect_uri: str = "https://www.google.com",
    headless: bool = True,
) -> str | None:
    """
    Uses Playwright to:
    1. Navigate to OAuth auth URL
    2. Fill login form (user/pass/TOTP)
    3. Capture redirect URL → extract auth_code query param
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("[shoonya] playwright not installed: pip install playwright")
        return None

    auth_url = (
        f"{_AUTH_URL}"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
    )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()

        captured_code = None

        def handle_response(response):
            nonlocal captured_code
            # Capture redirect to redirect_uri containing ?code=
            if redirect_uri.split("//")[1].split("/")[0] in response.url:
                parsed = urlparse(response.url)
                params = parse_qs(parsed.query)
                if "code" in params:
                    captured_code = params["code"][0]
                    logger.info(f"[shoonya] auth_code captured: {captured_code[:8]}...")

        page.on("response", handle_response)

        try:
            page.goto(auth_url, timeout=30000)
            # Fill credentials — adjust selectors if Shoonya changes login UI
            page.fill('input[name="uid"], input[placeholder*="User"], #username', client_id)
            page.fill('input[type="password"]', password)
            page.click('button[type="submit"], input[type="submit"], .login-btn')
            page.wait_for_timeout(2000)

            # Fill TOTP if prompted
            totp_selector = 'input[name="factor2"], input[placeholder*="OTP"], input[placeholder*="TOTP"]'
            if page.is_visible(totp_selector):
                page.fill(totp_selector, totp)
                page.click('button[type="submit"], input[type="submit"], .authorize-btn')
                page.wait_for_timeout(3000)

        except Exception as exc:
            logger.error(f"[shoonya] Playwright form fill failed: {exc}")
        finally:
            browser.close()

        return captured_code


def exchange_code_for_token(
    client_id: str,
    oauth_secret: str,
    auth_code: str,
) -> str | None:
    """
    POST auth_code + checksum to GetToken endpoint.
    Returns susertoken/access_token string or None.
    """
    checksum = _sha256(f"{client_id}{oauth_secret}{auth_code}")

    try:
        resp = requests.post(
            _TOKEN_URL,
            json={"code": auth_code, "checksum": checksum},
            headers={"Authorization": f"Bearer {checksum}"},
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.error(f"[shoonya] GetToken request failed: {exc}")
        return None

    if resp.status_code != 200:
        logger.error(f"[shoonya] GetToken HTTP {resp.status_code}: {resp.text[:120]!r}")
        return None

    try:
        data = resp.json()
    except ValueError:
        logger.error(f"[shoonya] GetToken non-JSON: {resp.text[:120]!r}")
        return None

    token = data.get("susertoken") or data.get("access_token")
    if not token:
        logger.error(f"[shoonya] No token in response: {data}")
        return None

    logger.info("[shoonya] OAuth access_token acquired")
    return token


def get_shoonya_token_oauth() -> str | None:
    """
    Full OAuth flow entry point.
    Reads creds from env. Returns susertoken or None.
    """
    import pyotp

    client_id    = os.environ["SHOONYA_USER"]
    password     = os.environ["SHOONYA_PASSWORD"]
    oauth_secret = os.environ["SHOONYA_OAUTH_SECRET"]   # 64-char key
    totp_secret  = os.environ["SHOONYA_TOTP_SECRET"]
    redirect_uri = os.getenv("SHOONYA_REDIRECT_URI", "https://www.google.com")

    totp = pyotp.TOTP(totp_secret).now()

    auth_code = get_auth_code_headless(
        client_id=client_id,
        password=password,
        totp=totp,
        oauth_secret=oauth_secret,
        redirect_uri=redirect_uri,
        headless=True,
    )
    if not auth_code:
        logger.error("[shoonya] Failed to extract auth_code via browser")
        return None

    return exchange_code_for_token(client_id, oauth_secret, auth_code)
```

### Wire into `shoonya_session.py`

```python
# In get_shoonya_api(), replace the login block with:

auth_mode = os.getenv("SHOONYA_AUTH_MODE", "quickauth").lower()

if auth_mode == "oauth":
    from pipeline.adapters.shoonya_oauth import get_shoonya_token_oauth
    access_token = get_shoonya_token_oauth()
else:
    # QuickAuth path (existing _safe_login)
    access_token = None
    for host, _ in _host_pairs():
        ret = _safe_login(_ShoonyaApi(), creds, two_fa, host)
        if ret:
            access_token = ret.get("susertoken")
            break

if not access_token:
    _logged_in = False
    _last_failure_ts = now
    _last_failure_msg = f"{auth_mode} login failed"
    return None

api = _ShoonyaApi()
setattr(api, "_NorenApi__username",   creds["SHOONYA_USER"])
setattr(api, "_NorenApi__accountid",  creds["SHOONYA_USER"])
setattr(api, "_NorenApi__password",   creds["SHOONYA_PASSWORD"])
setattr(api, "_NorenApi__susertoken", access_token)

_api = api
_logged_in = True
_login_ts = now
_last_failure_ts = 0.0
logger.info(f"[shoonya] Login OK via {auth_mode} — uid={creds['SHOONYA_USER']}")
return _api
```

---

## Updated `.env` Block

```env
# ── Shoonya Auth ──────────────────────────────────────────────────────────────
SHOONYA_USER=FA369105_U
SHOONYA_PASSWORD=Iamok@5678
SHOONYA_TOTP_SECRET=DCKRK73NFWSF3RTWASP25GW4FK7BSO4K

# Key for QuickAuth (32-char, SHA256 into appkey field)
SHOONYA_API_KEY=bf1868d88e0d7abb8709c49544972219

# Key for OAuth checksum (64-char secret from Prism)
SHOONYA_OAUTH_SECRET=q3idKOCfhimIC3DR48NDMjb4eDpfxIYpeXKQjjRxOIIMcD8flb7FoNQ4FboYi2O8

# Auth mode: "quickauth" or "oauth"
SHOONYA_AUTH_MODE=quickauth

# OAuth-specific (only needed if AUTH_MODE=oauth)
SHOONYA_REDIRECT_URI=https://www.google.com
SHOONYA_VENDOR_CODE=FA369105_U
SHOONYA_IMEI=abc1234
```

---

## Decision Tree — Which Path to Take

```
Run QuickAuth curl test (see PATH 1)
        │
        ├── stat: Ok → Use PATH 1 (QuickAuth with 32-char key)
        │              Set SHOONYA_AUTH_MODE=quickauth
        │              Set SHOONYA_API_KEY=bf1868d88e0d7abb8709c49544972219
        │
        ├── Not_Ok / Invalid Credentials → Debug TOTP or IMEI
        │              Regenerate API key in Prism if needed
        │
        └── 502 / API not supported → Use PATH 2 (OAuth + Playwright)
                       Set SHOONYA_AUTH_MODE=oauth
                       pip install playwright && playwright install chromium
                       Whitelist server IP in Prism portal
```

---

## Fix Checklist

| ID | Description | File | Priority | Status |
|---|---|---|---|---|
| FIX-1 | Separate 32-char vs 64-char keys in `.env` | `file.env` | P1 | ☐ |
| FIX-2 | Run `curl` QuickAuth test to confirm path | CLI | P1 | ☐ |
| FIX-3a | *If QuickAuth works:* use `SHOONYA_API_KEY` in `_safe_login` | `shoonya_session.py` | P1 | ☐ |
| FIX-3b | *If QuickAuth dead:* add `shoonya_oauth.py` + Playwright | new file | P1 | ☐ |
| FIX-4 | Wire `SHOONYA_AUTH_MODE` toggle into `get_shoonya_api()` | `shoonya_session.py` | P2 | ☐ |
