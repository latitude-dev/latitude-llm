"""Tests for tracer access via Latitude bootstrap."""

import logging
from unittest.mock import patch

import pytest
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry import Latitude, init_latitude


class TestTracerAccess:
    """Tests that the tracer is properly exposed via Latitude()."""

    @pytest.fixture
    def latitude(self):
        """Create a latitude instance with mocked exporter."""
        with patch("latitude_telemetry.telemetry.latitude_span_processor.create_exporter"):
            lat = Latitude(
                api_key="test-api-key",
                project_slug="test-project",
                disable_batch=True,
                tracer_provider=TracerProvider(),
            )
            yield lat
            lat.shutdown()

    def test_provider_is_exposed(self, latitude):
        """Test that latitude.provider is available."""
        assert latitude.provider is not None

    def test_tracer_can_be_obtained_from_provider(self, latitude):
        """Test that we can get a tracer from the provider."""
        tracer = latitude.provider.get_tracer("test")
        assert tracer is not None

    def test_tracer_can_start_span(self, latitude):
        """Test that we can create spans via the tracer."""
        tracer = latitude.provider.get_tracer("test")
        span = tracer.start_span("test-span")
        assert span is not None
        span.end()

    def test_tracer_start_as_current_span(self, latitude):
        """Test using start_as_current_span context manager."""
        tracer = latitude.provider.get_tracer("test")
        with tracer.start_as_current_span("test-span") as span:
            assert span is not None
            span.set_attribute("test.key", "test-value")

    def test_init_latitude_keeps_dict_compatibility(self):
        """Test that init_latitude keeps the previous dict return shape."""
        with patch("latitude_telemetry.telemetry.latitude_span_processor.create_exporter"):
            lat = init_latitude(
                api_key="test-api-key",
                project_slug="test-project",
                disable_batch=True,
            )

            assert lat["provider"] is not None
            lat["flush"]()
            lat["shutdown"]()


class TestServiceNameOverride:
    """`service.name` must be applied as a resource attribute, not as a span attribute."""

    def test_service_name_is_a_resource_attribute_when_latitude_owns_the_provider(self):
        """When Latitude creates its own provider, `service_name` lands on the resource (not as a span attribute)."""
        latitude_exporter = InMemorySpanExporter()

        lat = Latitude(
            api_key="test-api-key",
            project_slug="test-project",
            disable_batch=True,
            # No tracer_provider: Latitude owns the provider.
            service_name="latitude-service",
            exporter=latitude_exporter,
        )

        tracer = lat.provider.get_tracer("svc-name-test")
        with tracer.start_as_current_span("llm-call") as span:
            span.set_attribute("gen_ai.system", "openai")

        lat.flush()

        finished = latitude_exporter.get_finished_spans()
        assert len(finished) == 1
        # Resource attribute carries the value (semantic-conventions-correct).
        assert finished[0].resource.attributes.get(SERVICE_NAME) == "latitude-service"
        # Span attribute does NOT carry service.name (which would be off-spec).
        assert "service.name" not in (finished[0].attributes or {})

        lat.shutdown()

    def test_service_name_is_ignored_when_piggy_backing(self):
        """When piggy-backing on a host provider, `service_name` is ignored — host resource wins."""
        host_exporter = InMemorySpanExporter()
        latitude_exporter = InMemorySpanExporter()
        host_provider = TracerProvider(resource=Resource.create({SERVICE_NAME: "host-service"}))
        host_provider.add_span_processor(SimpleSpanProcessor(host_exporter))

        lat = Latitude(
            api_key="test-api-key",
            project_slug="test-project",
            disable_batch=True,
            tracer_provider=host_provider,
            service_name="latitude-service",  # explicitly passed — should be ignored
            exporter=latitude_exporter,
        )

        tracer = lat.provider.get_tracer("svc-name-piggy")
        with tracer.start_as_current_span("llm-call") as span:
            span.set_attribute("gen_ai.system", "openai")

        lat.flush()

        # Both exporters see the host's service.name — Latitude defers to the host.
        assert host_exporter.get_finished_spans()[0].resource.attributes.get(SERVICE_NAME) == "host-service"
        assert latitude_exporter.get_finished_spans()[0].resource.attributes.get(SERVICE_NAME) == "host-service"

        lat.shutdown()


class TestUnattachableProvider:
    """When the target provider has no `add_span_processor`, fall back with a warning."""

    def test_warns_and_falls_back_when_provider_cannot_be_attached(self, caplog):
        class OpaqueProvider:
            def get_tracer(self, *args, **kwargs):  # noqa: D401, ANN002, ANN003
                from opentelemetry.trace import NoOpTracer

                return NoOpTracer()

        opaque = OpaqueProvider()

        with (
            patch("latitude_telemetry.telemetry.latitude_span_processor.create_exporter"),
            caplog.at_level(logging.WARNING, logger="latitude_telemetry.sdk.init"),
        ):
            lat = Latitude(
                api_key="test-api-key",
                project_slug="test-project",
                disable_batch=True,
                tracer_provider=opaque,  # type: ignore[arg-type]
            )

        assert any("Could not attach LatitudeSpanProcessor" in r.message for r in caplog.records)
        # Fallback creates a Latitude-owned provider that is NOT the passed-in opaque one.
        assert lat.provider is not opaque

        lat.shutdown()
