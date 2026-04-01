"""Tests for manual span creation via the tracer."""

import pytest
from unittest.mock import patch

from latitude_telemetry import Telemetry, TelemetryOptions


class TestTracerAccess:
    """Tests that the tracer is properly exposed."""

    @pytest.fixture
    def telemetry(self):
        with patch("latitude_telemetry.telemetry.telemetry.create_exporter"):
            t = Telemetry("test-api-key", "test-project", TelemetryOptions(disable_batch=True))
            yield t
            t.shutdown()

    def test_tracer_is_exposed(self, telemetry):
        """Test that telemetry.tracer is available."""
        assert telemetry.tracer is not None

    def test_tracer_can_start_span(self, telemetry):
        """Test that we can create spans via the tracer."""
        span = telemetry.tracer.start_span("test-span")
        assert span is not None
        span.end()

    def test_tracer_start_as_current_span(self, telemetry):
        """Test using start_as_current_span context manager."""
        with telemetry.tracer.start_as_current_span("test-span") as span:
            assert span is not None
            span.set_attribute("test.key", "test-value")
