import unittest
from typing import Any, Dict, List, Optional

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry import GatewayOptions, InternalOptions, Telemetry, TelemetryOptions


class TestExporter(SpanExporter):
    """Test exporter that captures spans in memory for verification."""

    def __init__(self):
        self._spans: List[ReadableSpan] = []

    def export(self, spans):
        self._spans.extend(spans)
        return SpanExportResult.SUCCESS

    def shutdown(self):
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True

    def get_spans(self) -> List[ReadableSpan]:
        return self._spans

    def clear(self):
        self._spans = []


class TestCase(unittest.TestCase):
    telemetry: Telemetry
    test_exporter: TestExporter

    def setUp(self):
        self.maxDiff = None

        self.base_url = "https://fake-host.com"
        self.internal_options = InternalOptions(
            gateway=GatewayOptions(base_url=self.base_url),
            timeout=30,
        )
        self.api_key = "fake-api-key"

        # Create test exporter that captures spans
        self.test_exporter = TestExporter()

        # Create telemetry with the test exporter
        self.telemetry = Telemetry(
            self.api_key,
            TelemetryOptions(
                instrumentors=[],
                disable_batch=True,
                internal=self.internal_options,
            ),
        )

        # Replace the exporter with our test exporter
        # The span processor has already been added, so we need to access it
        for processor in self.telemetry._tracer_provider._active_span_processor._span_processors:
            if hasattr(processor, 'span_exporter'):
                processor.span_exporter = self.test_exporter

    def tearDown(self):
        self.telemetry.uninstrument()
        self.test_exporter.clear()

    def get_exported_spans(self) -> List[ReadableSpan]:
        """Get all exported spans."""
        self.telemetry.flush()
        return self.test_exporter.get_spans()

    def get_span_attributes(self, span: ReadableSpan) -> Dict[str, Any]:
        """Get span attributes as a dictionary."""
        return dict(span.attributes) if span.attributes else {}

    def assert_span_has_attribute(
        self,
        span: ReadableSpan,
        key: str,
        expected_value: Optional[Any] = None,
    ):
        """Assert that a span has a specific attribute."""
        attrs = self.get_span_attributes(span)
        self.assertIn(key, attrs, f"Attribute '{key}' not found in span")
        if expected_value is not None:
            self.assertEqual(
                attrs[key],
                expected_value,
                f"Attribute '{key}' value mismatch",
            )

    def assert_span_name(self, span: ReadableSpan, expected_name: str):
        """Assert that a span has a specific name."""
        self.assertEqual(span.name, expected_name)

    def find_span_by_name(self, name: str) -> Optional[ReadableSpan]:
        """Find a span by name."""
        for span in self.get_exported_spans():
            if span.name == name:
                return span
        return None
