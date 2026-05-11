"""Tests for exporter URL resolution."""

import pytest

from latitude_telemetry.env.env import get_exporter_url


class TestGetExporterUrl:
    def test_returns_latitude_telemetry_url_when_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LATITUDE_TELEMETRY_URL", "https://custom.example.com")
        assert get_exporter_url() == "https://custom.example.com"

    def test_strips_trailing_slash_from_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LATITUDE_TELEMETRY_URL", "https://custom.example.com/")
        assert get_exporter_url() == "https://custom.example.com"

    def test_returns_production_ingest_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("LATITUDE_TELEMETRY_URL", raising=False)
        assert get_exporter_url() == "https://ingest.latitude.so"
