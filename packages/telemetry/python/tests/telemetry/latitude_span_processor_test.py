"""Tests for LatitudeSpanProcessor span attributes."""

from unittest.mock import MagicMock, patch

from opentelemetry.context import Context

from latitude_telemetry.constants import ATTRIBUTES
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessor


def test_stamps_latitude_project_on_every_span() -> None:
    with patch("latitude_telemetry.telemetry.latitude_span_processor.create_exporter"):
        processor = LatitudeSpanProcessor(api_key="k", project_slug="my-proj", options=None)

    span = MagicMock()
    processor.on_start(span, Context())

    span.set_attribute.assert_any_call(ATTRIBUTES.project, "my-proj")
