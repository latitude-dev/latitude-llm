from latitude_telemetry import SpanPrompt
from tests.utils import TestCase


class TestSpan(TestCase):
    def test_legacy_span_creates_spans(self):
        """Test that legacy_span creates spans with proper nesting."""
        with self.telemetry.legacy_span(
            name="first",
            prompt=SpanPrompt(
                uuid="prompt-uuid",
                version_uuid="version-uuid",
                parameters={"parameter": "value"},
            ),
            distinct_id="distinct-id",
            metadata={"key": "value"},
        ):
            with self.telemetry.legacy_span("second"):
                pass

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 2)

        # Find spans by name
        first_span = self.find_span_by_name("first")
        second_span = self.find_span_by_name("second")

        self.assertIsNotNone(first_span)
        self.assertIsNotNone(second_span)

        # Verify first span has correct attributes
        self.assert_span_has_attribute(first_span, "latitude.prompt")
        self.assert_span_has_attribute(first_span, "latitude.distinctId", "distinct-id")
        self.assert_span_has_attribute(first_span, "latitude.metadata")

        # Verify parent-child relationship
        self.assertIsNotNone(second_span.parent)
        self.assertEqual(second_span.parent.span_id, first_span.context.span_id)

    def test_single_span(self):
        """Test creating a single span."""
        with self.telemetry.legacy_span("test-span"):
            pass

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 1)

        span = spans[0]
        self.assert_span_name(span, "test-span")
