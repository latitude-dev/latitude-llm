"""Shared pytest fixtures for telemetry tests."""

import pytest
from opentelemetry import trace


@pytest.fixture(autouse=True)
def reset_global_tracer_provider():
    """Reset OTel's global tracer provider between tests.

    `trace.set_tracer_provider` is single-write — once set, subsequent calls log
    a warning and are silent no-ops. Tests that construct `Latitude(tracer_provider=None)`
    (e.g. `test_init_latitude_keeps_dict_compatibility`) register a real provider
    globally; a later test on the same worker then piggy-backs on it and silently
    drops `service_name` (init.py:98). The public API can't undo the registration,
    so we reach into the private `Once` lock and cached provider to clear both.
    """
    yield
    trace._TRACER_PROVIDER_SET_ONCE._done = False  # type: ignore[attr-defined]
    trace._TRACER_PROVIDER = None  # type: ignore[attr-defined]
