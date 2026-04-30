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
from typing import Optional

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
) -> Optional[str]:
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
        # Launching with a longer timeout and specific args for headless stability
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context()
        page = context.new_page()

        captured_code = None

        def handle_request(request):
            nonlocal captured_code
            # Extract redirect URL containing ?code=
            if redirect_uri.split("//")[1].split("/")[0] in request.url:
                parsed = urlparse(request.url)
                params = parse_qs(parsed.query)
                if "code" in params:
                    captured_code = params["code"][0]
                    logger.info(f"[shoonya] auth_code captured: {captured_code[:8]}...")

        page.on("request", handle_request)

        try:
            page.goto(auth_url, wait_until="networkidle", timeout=30000)
            
            # Fill credentials
            page.fill('input[name="uid"], input[placeholder*="User"], #username', client_id)
            page.fill('input[type="password"]', password)
            
            # Click Login
            page.click('button[type="submit"], input[type="submit"], .login-btn')
            page.wait_for_timeout(2000)

            # Fill TOTP if prompted (wait for the input to appear)
            totp_selector = 'input[name="factor2"], input[placeholder*="OTP"], input[placeholder*="TOTP"]'
            try:
                page.wait_for_selector(totp_selector, timeout=5000)
                page.fill(totp_selector, totp)
                page.click('button[type="submit"], input[type="submit"], .authorize-btn')
                # Wait for the redirect to happen
                page.wait_for_timeout(5000)
            except:
                logger.debug("[shoonya] TOTP field not found or not required")

        except Exception as exc:
            logger.error(f"[shoonya] Playwright flow failed: {exc}")
        finally:
            browser.close()

        return captured_code


def exchange_code_for_token(
    client_id: str,
    oauth_secret: str,
    auth_code: str,
) -> Optional[str]:
    """
    POST auth_code + checksum to GetToken endpoint.
    Returns susertoken/access_token string or None.
    """
    # Checksum format for Shoonya GetToken: SHA256(client_id + secret + code)
    raw_text = f"{client_id}{oauth_secret}{auth_code}"
    checksum = _sha256(raw_text)

    try:
        resp = requests.post(
            _TOKEN_URL,
            json={"code": auth_code, "checksum": checksum},
            headers={"Content-Type": "application/json"},
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

    # Stat check
    if data.get("stat") != "Ok":
        logger.error(f"[shoonya] GetToken Error: {data.get('emsg', 'Unknown error')}")
        return None

    token = data.get("susertoken") or data.get("access_token")
    if not token:
        logger.error(f"[shoonya] No token in response: {data}")
        return None

    logger.info("[shoonya] OAuth access_token acquired")
    return token


def get_shoonya_token_oauth() -> Optional[str]:
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
