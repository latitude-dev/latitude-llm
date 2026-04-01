"""
Latitude Telemetry SDK for Python.

Instruments AI provider calls and forwards traces to Latitude.

Example:
    from latitude_telemetry import Telemetry, Instrumentors

    telemetry = Telemetry(
        api_key="your-api-key",
        project_slug="my-project",
        options=TelemetryOptions(
            instrumentors=[Instrumentors.OpenAI, Instrumentors.Anthropic]
        )
    )

    # Auto-instrumented provider calls are traced automatically.
    # Use capture() to add trace-wide context:
    @telemetry.capture(tags=["prod"], user_id="user-123")
    def my_function():
        client = OpenAI()
        return client.chat.completions.create(...)
"""

import warnings

# Suppress Pydantic V2 deprecation warnings from OpenTelemetry instrumentation dependencies
warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")

# Constants
from latitude_telemetry.constants import ATTRIBUTES

# Exporter
from latitude_telemetry.exporter import ExporterOptions, create_exporter

# Instrumentations
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    CaptureOptions,
    ManualInstrumentation,
    TraceContext,
)

# Main SDK
from latitude_telemetry.telemetry.telemetry import (
    CaptureContext,
    InternalOptions,
    Telemetry,
    TelemetryOptions,
)

# Types
from latitude_telemetry.telemetry.types import (
    GatewayOptions,
    Instrumentors,
)

__all__ = [
    # Main SDK
    "Telemetry",
    "TelemetryOptions",
    "InternalOptions",
    "CaptureContext",
    # Types
    "Instrumentors",
    "GatewayOptions",
    # Constants
    "ATTRIBUTES",
    # Instrumentations
    "BaseInstrumentation",
    "ManualInstrumentation",
    "TraceContext",
    "CaptureOptions",
    # Exporter
    "create_exporter",
    "ExporterOptions",
]
