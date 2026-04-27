"""
pipeline/adapters/nse_session.py
Resilient custom session for NSE APIs.
Fetches homepage first to establish cookies, then hits the target endpoint.
"""
import requests
import logging
import time

logger = logging.getLogger(__name__)

HEADERS = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9,en-IN;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'priority': 'u=0, i',
    'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
}

_SESSION = None
_LAST_INIT = 0

def get_nse_session() -> requests.Session:
    global _SESSION, _LAST_INIT
    now = time.time()
    # Refresh session every 5 minutes to avoid stale cookies
    if _SESSION is None or (now - _LAST_INIT) > 300:
        _SESSION = requests.Session()
        _SESSION.headers.update(HEADERS)
        try:
            logger.info("[nse_session] Initializing NSE session (fetching homepage cookies)...")
            _SESSION.get("https://www.nseindia.com", timeout=10)
            _SESSION.get("https://www.nseindia.com/option-chain", timeout=10)
        except Exception as e:
            logger.warning(f"[nse_session] Failed to initialize session: {e}")
        _LAST_INIT = now
    return _SESSION

def fetch_nse_api(url: str, referer: str = "https://www.nseindia.com") -> dict:
    """Fetch JSON from NSE API using the resilient session."""
    session = get_nse_session()
    headers = session.headers.copy()
    headers["accept"] = "application/json, text/javascript, */*; q=0.01"
    headers["sec-fetch-dest"] = "empty"
    headers["sec-fetch-mode"] = "cors"
    headers["sec-fetch-site"] = "same-origin"
    headers["referer"] = referer
    
    resp = session.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()
