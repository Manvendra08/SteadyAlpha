"""
pipeline/adapters/nse_session.py
Resilient "Stealth" session for NSE APIs.
Implements browser mimicry, User-Agent rotation, and automatic cookie management.
"""
import requests
import logging
import time
import random
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
]

class StealthSession(requests.Session):
    """
    A requests.Session subclass that mimics a real browser.
    Automatically handles the 'Cookie Dance' with the NSE homepage.
    """
    def __init__(self):
        super().__init__()
        self.ua = random.choice(USER_AGENTS)
        self.headers.update({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': self.ua,
            'Connection': 'keep-alive',
            'Sec-Ch-Ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        })
        self._last_init = 0
        self._init_success = False

    def initialize(self) -> bool:
        """Fetch homepage and major landing pages to establish valid session cookies."""
        now = time.time()
        if self._init_success and (now - self._last_init) < 300:
            return True

        try:
            logger.info(f"[nse_session] Warming up stealth session (UA: {self.ua})...")
            self.cookies.clear()
            
            # 1. Hit homepage
            self.get("https://www.nseindia.com", timeout=10)
            time.sleep(random.uniform(1.0, 2.0))
            
            # 2. Hit the Option Chain landing page
            self.get("https://www.nseindia.com/option-chain", timeout=10)
            time.sleep(random.uniform(0.5, 1.0))

            # 3. Hit the Derivatives landing page (specifically for NIFTY)
            self.get("https://www.nseindia.com/get-quotes/derivatives?symbol=NIFTY", timeout=10)
            time.sleep(random.uniform(0.5, 1.0))
            
            self._last_init = now
            self._init_success = True
            logger.info("[nse_session] Stealth session initialized successfully.")
            return True
        except Exception as e:
            logger.warning(f"[nse_session] Failed to warm up session: {e}")
            self._init_success = False
            return False

_GLOBAL_SESSION: Optional[StealthSession] = None

def get_nse_session() -> StealthSession:
    """Singleton getter for the global stealth session."""
    global _GLOBAL_SESSION
    if _GLOBAL_SESSION is None:
        _GLOBAL_SESSION = StealthSession()
    _GLOBAL_SESSION.initialize()
    return _GLOBAL_SESSION

def fetch_nse_json(url: str, referer: str = "https://www.nseindia.com") -> Optional[Dict[str, Any]]:
    """Fetch JSON from NSE with full stealth headers."""
    try:
        session = get_nse_session()
        headers = session.headers.copy()
        headers.update({
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': referer,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        })
        
        time.sleep(random.uniform(0.8, 1.5))
        
        resp = session.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            logger.warning(f"[nse_session] HTTP {resp.status_code} for {url}. Text: {resp.text[:200]}")
            return None
            
        try:
            res = resp.json()
            if not res and "/api/option-chain" in url:
                 logger.warning(f"[nse_session] NSE returned empty JSON for {url}. Possible silent block.")
            return res
        except Exception as je:
            logger.error(f"[nse_session] JSON decode failed for {url}. Text: {resp.text[:200]}")
            return None
            
    except Exception as e:
        logger.error(f"[nse_session] Request exception for {url}: {e}")
        return None
