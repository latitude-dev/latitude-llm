"""Tests for tracer access via init_latitude()."""

from unittest.mock import patch

import pytest

from latitude_telemetry import init_latitude


class TestTracerAccess:
    """Tests that the tracer is properly exposed via init_latitude()."""

    @pytest.fixture
    def latitude(self):
        """Create a latitude instance with mocked exporter."""
        with patch("latitude_telemetry.exporter.create_exporter"):
            lat = init_latitude(
                api_key="test-api-key",
                project_slug="test-project",
                disable_batch=True,
            )
            yield lat
            lat["shutdown"]()

    def test_provider_is_exposed(self, latitude):
        """Test that latitude.provider is available."""
        assert latitude["provider"] is not None

    def test_tracer_can_be_obtained_from_provider(self, latitude):
        """Test that we can get a tracer from the provider."""
        tracer = latitude["provider"].get_tracer("test")
        assert tracer is not None

    def test_tracer_can_start_span(self, latitude):
        """Test that we can create spans via the tracer."""
        tracer = latitude["provider"].get_tracer("test")
        span = tracer.start_span("test-span")
        assert span is not None
        span.end()

    def test_tracer_start_as_current_span(self, latitude):
        """Test using start_as_current_span context manager."""
        tracer = latitude["provider"].get_tracer("test")
        with tracer.start_as_current_span("test-span") as span:
            assert span is not None
            span.set_attribute("test.key", "test-value")
