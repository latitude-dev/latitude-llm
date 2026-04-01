import unittest
from typing import Any, Dict, List, Optional

from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry import LatitudeSpanProcessor
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessorOptions


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
    """Base test case for Latitude Telemetry tests."""

    provider: TracerProvider
    test_exporter: TestExporter

    def setUp(self):
        self.maxDiff = None
        self.api_key = "fake-api-key"

        # Create test exporter that captures spans
        self.test_exporter = TestExporter()

        # Create provider with test exporter
        self.provider = TracerProvider()
        self.provider.add_span_processor(
            LatitudeSpanProcessor(
                self.api_key,
                "test-project",
                options=LatitudeSpanProcessorOptions(
                    disable_batch=True,
                    disable_smart_filter=True,
                ),
            )
        )

        def patch_span_exporter(processor: object) -> bool:
            if hasattr(processor, "span_exporter"):
                processor.span_exporter = self.test_exporter
                return True
            inner = getattr(processor, "_inner", None)
            if inner is not None and patch_span_exporter(inner):
                return True
            export_processor = getattr(processor, "_export_processor", None)
            if export_processor is not None and patch_span_exporter(export_processor):
                return True
            return False

        from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor

        for processor in self.provider._active_span_processor._span_processors:
            patch_span_exporter(processor)

    def tearDown(self):
        self.provider.shutdown()
        self.test_exporter.clear()

    def get_exported_spans(self) -> List[ReadableSpan]:
        """Get all exported spans."""
        self.provider.force_flush()
        return self.test_exporter.get_spans()

    def get_span_attributes(self, span: ReadableSpan) -> Dict[str, Any]:
        """Get span attributes as a dictionary."""
        return dict(span.attributes) if span.attributes else {}

    def assert_span_has_attribute(
        self,
        span: ReadableSpan,
        key: str,
        expected_value: Any | None = None,
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

    def find_span_by_name(self, name: str) -> ReadableSpan | None:
        """Find a span by name."""
        for span in self.get_exported_spans():
            if span.name == name:
                return span
        return None
