"""
Data health validation for SteadyAlpha pipeline.

Classifies incoming data as FRESH, STALE, DEGRADED, or MISSING
based on timestamps, null counts, and sanity rules.
"""

from enum import Enum
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
import hashlib
import json


class DataHealth(Enum):
    FRESH = "fresh"
    STALE = "stale"
    DEGRADED = "degraded"
    MISSING = "missing"


def validate_freshness(
    last_updated: Optional[datetime],
    threshold_minutes: int = 60,
) -> DataHealth:
    """
    Check if data is fresh enough for downstream consumption.

    Args:
        last_updated: Timestamp of the data's last update (UTC).
        threshold_minutes: Maximum acceptable age in minutes.

    Returns:
        DataHealth classification.
    """
    if last_updated is None:
        return DataHealth.MISSING

    now = datetime.now(timezone.utc)
    age = now - last_updated

    if age <= timedelta(minutes=threshold_minutes):
        return DataHealth.FRESH
    elif age <= timedelta(minutes=threshold_minutes * 3):
        return DataHealth.STALE
    else:
        return DataHealth.DEGRADED


def validate_sanity(
    data: dict[str, Any],
    rules: dict[str, dict],
) -> tuple[DataHealth, list[str]]:
    """
    Apply sanity rules to data fields.

    Each rule in `rules` is keyed by field name and may contain:
      - required (bool): field must exist and not be None
      - min (float): minimum acceptable value
      - max (float): maximum acceptable value

    Returns:
        (DataHealth, list of warning strings)
    """
    warnings: list[str] = []

    for field_name, rule in rules.items():
        value = data.get(field_name)

        if rule.get("required", False) and value is None:
            warnings.append(f"Missing required field: {field_name}")
            continue

        if value is None:
            continue

        if "min" in rule and value < rule["min"]:
            warnings.append(
                f"{field_name}={value} below min {rule['min']}"
            )

        if "max" in rule and value > rule["max"]:
            warnings.append(
                f"{field_name}={value} above max {rule['max']}"
            )

    if not warnings:
        return DataHealth.FRESH, warnings
    elif len(warnings) <= 2:
        return DataHealth.DEGRADED, warnings
    else:
        return DataHealth.MISSING, warnings


def compute_digest(data: Any) -> str:
    """Compute a SHA-256 digest of serializable data for audit trail."""
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]
