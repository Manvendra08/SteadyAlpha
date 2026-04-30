"""
pipeline/adapters/base.py
Common types and utilities for all fetch adapters.
"""

from __future__ import annotations

import json
import logging
import time
import functools
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

# ─── Source / freshness / criticality enums ───────────────────────────────────

SOURCE_TYPE = {
    "REAL":    "REAL",
    "FALLBACK":"FALLBACK",
    "SCRAPED": "SCRAPED",
    "CACHED":  "CACHED",
    "DERIVED": "DERIVED",
    "CONFIG":  "CONFIG",
    "MISSING": "MISSING",
}

FRESHNESS = {
    "FRESH":   "FRESH",
    "STALE":   "STALE",
    "MISSING": "MISSING",
}

CRITICALITY = {
    "CRITICAL_FOR_DECISION":   "CRITICAL_FOR_DECISION",
    "CRITICAL_FOR_RISK":       "CRITICAL_FOR_RISK",
    "IMPORTANT_NONCRITICAL":   "IMPORTANT_NONCRITICAL",
    "DIAGNOSTIC_ONLY":         "DIAGNOSTIC_ONLY",
}


# ─── FetchResult ─────────────────────────────────────────────────────────────

@dataclass
class FetchResult:
    """Standard result envelope for every adapter fetch attempt."""
    dataset_key:    str
    provider:       str
    source_type:    str          # SOURCE_TYPE value
    freshness:      str          # FRESHNESS value
    criticality:    str          # CRITICALITY value
    success:        bool
    trading_valid:  bool
    market_date:    Optional[str] = None
    fetched_at:     Optional[str] = None
    record_count:   Optional[int] = None
    payload:        Any          = None
    warning:        Optional[str] = None
    error:          Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("payload", None)  # don't serialize payload to provenance row
        return d

    @staticmethod
    def missing(dataset_key: str, criticality: str, error: str = "No usable source") -> "FetchResult":
        return FetchResult(
            dataset_key=dataset_key, provider="none",
            source_type="MISSING", freshness="MISSING",
            criticality=criticality, success=False,
            trading_valid=False, error=error,
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )


# ─── Retry decorator ─────────────────────────────────────────────────────────

F = TypeVar("F", bound=Callable[..., Any])


def with_retry(max_attempts: int = 3, base_delay: float = 1.0, timeout: float = 20.0):
    """Exponential backoff retry. Raise on final failure."""
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc: Exception = RuntimeError("No attempts made")
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:
                    last_exc = exc
                    if attempt < max_attempts - 1:
                        delay = base_delay * (2 ** attempt) + (0.1 * attempt)
                        logger.warning(f"[retry] {fn.__name__} attempt {attempt+1}/{max_attempts} failed: {exc}. Retry in {delay:.1f}s")
                        time.sleep(delay)
                    else:
                        logger.error(f"[retry] {fn.__name__} exhausted {max_attempts} attempts: {exc}")
            raise last_exc
        return wrapper  # type: ignore
    return decorator


# ─── File cache (last valid real snapshot) ───────────────────────────────────

CACHE_DIR = Path("pipeline") / ".fetch_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _serialize_payload(obj: Any) -> Any:
    """Recursively handle pandas objects and ensure string keys for JSON serialization."""
    import pandas as pd
    if isinstance(obj, (pd.Series, pd.DataFrame)):
        # Convert to dict with string keys for dates
        d = obj.to_dict()
        return {str(k): _serialize_payload(v) for k, v in d.items()}
    if isinstance(obj, dict):
        return {str(k): _serialize_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_payload(x) for x in obj]
    return obj

def cache_write(key: str, result: FetchResult) -> None:
    """Persist valid result (meta + payload) to disk cache."""
    if not result.success or result.source_type == "MISSING":
        return 
    
    path = CACHE_DIR / f"{key}.json"
    
    # Handle payload serialization
    payload_serialized = None
    if result.payload is not None:
        try:
            payload_serialized = _serialize_payload(result.payload)
        except Exception as e:
            logger.warning(f"[cache] Failed to serialize payload for {key}: {e}")

    blob = {
        "dataset_key":  result.dataset_key,
        "provider":     result.provider,
        "source_type":  result.source_type,
        "freshness":    result.freshness,
        "criticality":  result.criticality,
        "market_date":  result.market_date,
        "fetched_at":   result.fetched_at,
        "record_count": result.record_count,
        "warning":      result.warning,
        "payload":      payload_serialized
    }
    path.write_text(json.dumps(blob, default=str)) # Use default=str as ultimate fallback
    logger.debug(f"[cache] Wrote {key} (meta + payload)")


def cache_read_meta(key: str, ttl_hours: Optional[int] = None) -> Optional[dict]:
    """Read cached metadata (without payload). Enforces TTL freshness."""
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        meta = json.loads(path.read_text())
        
        # Check TTL (v0.7.0)
        if ttl_hours:
            fetched_at_str = meta.get("fetched_at")
            if fetched_at_str:
                fetched_at = datetime.fromisoformat(fetched_at_str)
                age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
                if age_hours > ttl_hours:
                    meta["freshness"] = "STALE"
                    meta["warning"] = f"Cache stale by {age_hours - ttl_hours:.1f} hours"
        
        return meta
    except Exception:
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
