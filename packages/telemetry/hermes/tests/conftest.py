"""Shared fixtures.

The plugin caches its config process-wide, so every test starts from a clean
read of an environment that has credentials — otherwise the hooks are inert.
"""

from __future__ import annotations

import pytest

import latitude_telemetry_hermes.config as config
import latitude_telemetry_hermes.redact as redact

_ENV_PREFIXES = ("LATITUDE_", "HERMES_")


@pytest.fixture(autouse=True)
def clean_config(monkeypatch, tmp_path):
    for name in [n for n in list(__import__("os").environ) if n.startswith(_ENV_PREFIXES)]:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LATITUDE_API_KEY", "lat_test")
    monkeypatch.setenv("LATITUDE_PROJECT", "test-project")
    # A real ~/.hermes on the dev machine must never leak into a test.
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    config.set_plugin_context(_NoSettings())
    redact._reset_for_tests()
    yield
    config.set_plugin_context(_NoSettings())
    redact._reset_for_tests()


class _NoSettings:
    """A ctx facade with no config.yaml behind it."""

    profile_name = "default"

    def get_config(self, key, default=None):
        return default
