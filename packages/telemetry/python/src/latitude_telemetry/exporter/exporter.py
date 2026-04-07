from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import SpanExporter

from latitude_telemetry.util import Model


class ExporterOptions(Model):
    api_key: str
    project_slug: str
    endpoint: str
    timeout: float


def create_exporter(options: ExporterOptions) -> SpanExporter:
    """
    Create an OTLP span exporter configured for Latitude.
    """
    return OTLPSpanExporter(
        endpoint=f"{options.endpoint}/v1/traces",
        headers={
            "Authorization": f"Bearer {options.api_key}",
            "X-Latitude-Project": options.project_slug,
        },
        timeout=int(options.timeout),
    )
