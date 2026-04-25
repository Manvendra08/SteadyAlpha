"""
Source hierarchy management for SteadyAlpha data ingestion.

Each dataset has a primary and optional secondary source.
If the primary source fails or returns stale data, the system
falls back to the secondary source automatically.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Callable, Any


class SourceStatus(Enum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    STALE = "stale"


@dataclass
class DataSource:
    """Represents a single data source with its fetch function."""
    name: str
    fetch: Callable[..., Any]
    status: SourceStatus = SourceStatus.AVAILABLE


@dataclass
class SourceHierarchy:
    """
    Manages a ranked list of sources for a given dataset.
    Falls back through the list until a usable source is found.
    """
    dataset_id: str
    sources: list[DataSource] = field(default_factory=list)

    def add_source(self, source: DataSource) -> None:
        self.sources.append(source)

    def get_best_source(self) -> Optional[DataSource]:
        """Return the first available source in hierarchy order."""
        for source in self.sources:
            if source.status == SourceStatus.AVAILABLE:
                return source
        return None

    def fetch_data(self, **kwargs) -> tuple[Any, str]:
        """
        Attempt to fetch data from sources in priority order.
        Returns (data, source_name) tuple.
        Raises RuntimeError if all sources fail.
        """
        errors = []
        for source in self.sources:
            if source.status == SourceStatus.UNAVAILABLE:
                continue
            try:
                data = source.fetch(**kwargs)
                return data, source.name
            except Exception as e:
                source.status = SourceStatus.UNAVAILABLE
                errors.append(f"{source.name}: {e}")

        raise RuntimeError(
            f"All sources failed for '{self.dataset_id}': "
            + "; ".join(errors)
        )
