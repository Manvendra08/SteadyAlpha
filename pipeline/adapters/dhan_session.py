"""
pipeline/adapters/dhan_session.py
Dhan API session bootstrap.
Singleton pattern — one login per pipeline run.
Auth requires: DHAN_CLIENT_ID, DHAN_ACCESS_TOKEN
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ─── State ────────────────────────────────────────────────────────────────────

_lock       = threading.Lock()
_api        = None          # dhanhq instance
_logged_in  = False
_login_ts   = 0.0

_SESSION_TTL = 12 * 3600    # re-login after 12h

def get_dhan_api() -> Optional[object]:
    """
    Return an authenticated dhanhq instance, or None if auth unavailable.
    """
    global _api, _logged_in, _login_ts

    with _lock:
        # Deactivated for Phase 1
        return None

def dhan_available() -> bool:
    return get_dhan_api() is not None
