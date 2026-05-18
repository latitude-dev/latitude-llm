"""
Internal helpers for one-time deprecation warnings.

Lives in its own module so both ``init.py`` and ``context.py`` can depend on it
without forming a circular import (``init`` already imports the span processor,
which imports ``context``).
"""

import logging

logger = logging.getLogger(__name__)

_project_slug_deprecation_warned = False


def reset_project_slug_deprecation_warning_for_testing() -> None:
    """Test-only helper to reset the once-per-process deprecation flag."""
    global _project_slug_deprecation_warned
    _project_slug_deprecation_warned = False


def warn_project_slug_deprecated(site: str) -> None:
    """Log a one-time deprecation warning for the legacy ``project_slug`` argument."""
    global _project_slug_deprecation_warned
    if _project_slug_deprecation_warned:
        return
    _project_slug_deprecation_warned = True
    option = "`project_slug`" if site == "constructor" else "`project_slug` on capture()"
    logger.warning(
        "[Latitude] %s is deprecated and will be removed in a future release — rename it to "
        "`project`. Both work for now; when both are passed, `project` wins.",
        option,
    )
