from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import SpanExporter

from latitude_telemetry.util import Model


class ExporterOptions(Model):
    api_key: str
    project_slug: str | None
    endpoint: str
    timeout: float


def create_exporter(options: ExporterOptions) -> SpanExporter:
    """
    Create an OTLP span exporter configured for Latitude.
    """
    headers = {
        "Authorization": f"Bearer {options.api_key}",
    }
    if options.project_slug:
        headers["X-Latitude-Project"] = options.project_slug
    return OTLPSpanExporter(
        endpoint=f"{options.endpoint}/v1/traces",
        headers=headers,
        timeout=int(options.timeout),
    )
