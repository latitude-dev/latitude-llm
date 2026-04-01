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

    @telemetry.capture(tags=["prod"], user_id="user-123")
    def my_function():
        client = OpenAI()
        return client.chat.completions.create(...)
"""

import warnings

warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")

from latitude_telemetry.constants import ATTRIBUTES
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    CaptureOptions,
    ManualInstrumentation,
    TraceContext,
)
from latitude_telemetry.telemetry.telemetry import (
    CaptureContext,
    Telemetry,
    TelemetryOptions,
)
from latitude_telemetry.telemetry.types import Instrumentors

__all__ = [
    "Telemetry",
    "TelemetryOptions",
    "CaptureContext",
    "Instrumentors",
    "ATTRIBUTES",
    "BaseInstrumentation",
    "ManualInstrumentation",
    "TraceContext",
    "CaptureOptions",
]
