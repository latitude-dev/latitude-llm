from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import SpanExporter

from latitude_telemetry.telemetry.types import GatewayOptions
from latitude_telemetry.util import Model


class ExporterOptions(Model):
    api_key: str
    gateway: GatewayOptions
    timeout: float


def create_exporter(options: ExporterOptions) -> SpanExporter:
    """
    Create an OTLP span exporter configured for Latitude.

    Uses the standard OpenTelemetry OTLP HTTP exporter with custom
    endpoint and authorization headers.
    """
    return OTLPSpanExporter(
        endpoint=options.gateway.traces_url,
        headers={"Authorization": f"Bearer {options.api_key}"},
        timeout=int(options.timeout),
    )
