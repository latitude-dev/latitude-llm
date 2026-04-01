"""
Base instrumentation class for Latitude telemetry.
"""

from abc import ABC, abstractmethod


class BaseInstrumentation(ABC):
    """Base class for all Latitude instrumentations."""

    @abstractmethod
    def is_enabled(self) -> bool:
        """Check if instrumentation is enabled."""
        pass

    @abstractmethod
    def enable(self) -> None:
        """Enable the instrumentation."""
        pass

    @abstractmethod
    def disable(self) -> None:
        """Disable the instrumentation."""
        pass
