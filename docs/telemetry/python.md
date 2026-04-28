---
title: Python SDK
description: Full API reference for latitude-telemetry, the Python SDK for Latitude Telemetry.
---

# Python SDK

Instrument your AI application and send traces to Latitude. Built on OpenTelemetry.

## Installation

```bash
pip install latitude-telemetry
```

Requires Python 3.11+.

## Bootstrap (Recommended)

The fastest way to start. One function sets up a complete OpenTelemetry pipeline with LLM auto-instrumentation and the Latitude exporter:

```python
from latitude_telemetry import init_latitude
from openai import OpenAI

latitude = init_latitude(
    api_key="your-api-key",
    project_slug="your-project-slug",
    instrumentations=["openai"],
)

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

latitude.shutdown()
```

## Using `capture()` for Context

Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` when you want to:

- **Group traces by user or session**: Track all LLM calls from a specific user
- **Add business context**: Tag traces with environment, feature flags, or request IDs
- **Mark agent boundaries**: Wrap an agent run or conversation turn with a name and metadata
- **Filter and analyze**: Use tags and metadata to filter traces in Latitude

```python
from latitude_telemetry import init_latitude, capture

latitude = init_latitude(
    api_key="your-api-key",
    project_slug="your-project-slug",
    instrumentations=["openai"],
)

capture(
    "handle-user-request",
    lambda: client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": user_message}],
    ),
    {
        "user_id": "user_123",
        "session_id": "session_abc",
        "tags": ["production", "v2-agent"],
        "metadata": {"request_id": "req-xyz", "feature_flag": "new-prompt"},
    },
)

latitude.shutdown()
```

`capture()` does **not** create spans. It only attaches context to spans created by auto-instrumentation. Use one `capture()` call at the request or agent boundary. Nested calls inherit from the parent context with local overrides.

**Nesting behavior:**

| Field | Behavior |
|---|---|
| `user_id` | Last-write-wins |
| `session_id` | Last-write-wins |
| `metadata` | Shallow merge |
| `tags` | Append and dedupe, preserving order |

## Existing OpenTelemetry Setup (Advanced)

If your app already uses OpenTelemetry, add Latitude alongside your existing processors:

```python
from opentelemetry.sdk.trace import TracerProvider
from latitude_telemetry import LatitudeSpanProcessor, register_latitude_instrumentations

provider = TracerProvider()
provider.add_span_processor(LatitudeSpanProcessor("api-key", "project-slug"))

provider.register()

register_latitude_instrumentations(
    instrumentations=["openai"],
    tracer_provider=provider,
)
```

`LatitudeSpanProcessor` only exports spans to Latitude. You still need LLM instrumentations to create those spans. Use `register_latitude_instrumentations()` or bring your own OTel-compatible LLM instrumentation.

For examples of integrating with **Datadog**, **Sentry**, or other observability platforms, see the [OpenTelemetry Exporter](otel-exporter) guide. That guide also covers connecting from **any language** beyond TypeScript and Python.

## Public API Reference

```python
from latitude_telemetry import (
    init_latitude,
    LatitudeSpanProcessor,
    capture,
    register_latitude_instrumentations,
)
```

### `init_latitude(api_key, project_slug, **options)`

Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export.

```python
def init_latitude(
    api_key: str,
    project_slug: str,
    instrumentations: list[str] | None = None,
    disable_redact: bool = False,
    disable_batch: bool = False,
    disable_smart_filter: bool = False,
    should_export_span: Callable[[ReadableSpan], bool] | None = None,
    blocked_instrumentation_scopes: list[str] | None = None,
) -> dict:
    ...

# Returns:
# {
#     "provider": TracerProvider,
#     "flush": Callable[[], None],
#     "shutdown": Callable[[], None],
# }
```

### `capture(name, fn, options=None)`

Wraps a function to attach Latitude context to all spans created inside. Uses OpenTelemetry's native context API for scoping.

```python
def capture(
    name: str,
    fn: Callable[[], T],
    options: dict | None = None,
) -> T:
    ...

# options keys:
# {
#     "name": str | None,
#     "user_id": str | None,
#     "session_id": str | None,
#     "tags": list[str] | None,
#     "metadata": dict | None,
# }
```

| Option | Type | OTel Attribute | Description |
|---|---|---|---|
| `name` | `str` | `latitude.capture.name` | Name for the capture context |
| `tags` | `list[str]` | `latitude.tags` | Tags for filtering traces |
| `metadata` | `dict[str, Any]` | `latitude.metadata` | Arbitrary key-value metadata |
| `session_id` | `str` | `session.id` | Group traces by session |
| `user_id` | `str` | `user.id` | Associate traces with a user |

### `LatitudeSpanProcessor`

Span processor for shared-provider setups. Reads Latitude context from OTel context and stamps attributes onto spans.

```python
class LatitudeSpanProcessor:
    def __init__(
        self,
        api_key: str,
        project_slug: str,
        options: LatitudeSpanProcessorOptions | None = None,
    ):
        ...

@dataclass
class LatitudeSpanProcessorOptions:
    disable_redact: bool = False
    redact: RedactSpanProcessorOptions | None = None
    disable_batch: bool = False
    disable_smart_filter: bool = False
    should_export_span: Callable[[ReadableSpan], bool] | None = None
    blocked_instrumentation_scopes: tuple[str, ...] = ()
```

### `register_latitude_instrumentations(instrumentations, tracer_provider)`

Registers LLM auto-instrumentations against a specific tracer provider.

```python
def register_latitude_instrumentations(
    instrumentations: list[str],
    tracer_provider: TracerProvider,
) -> None:
    ...
```

## Supported Providers

| Identifier | Package |
|---|---|
| `"openai"` | `openai` |
| `"anthropic"` | `anthropic` |
| `"bedrock"` | `boto3` |
| `"cohere"` | `cohere` |
| `"langchain"` | `langchain-core` |
| `"llamaindex"` | `llama-index` |
| `"togetherai"` | `together` |
| `"vertexai"` | `google-cloud-aiplatform` |
| `"aiplatform"` | `google-cloud-aiplatform` |

## Configuration

### Smart Filtering

By default, only LLM-relevant spans are exported (spans with `gen_ai.*`, `llm.*`, `openinference.*`, or `ai.*` attributes, plus known LLM instrumentation scopes):

```python
processor = LatitudeSpanProcessor(
    "api-key",
    "project-slug",
    LatitudeSpanProcessorOptions(
        disable_smart_filter=True,  # Export all spans
    ),
)
```

### Redaction

PII redaction is enabled by default for security-sensitive attributes:

- HTTP authorization headers
- HTTP cookies
- HTTP API key headers (`x-api-key`)
- Database statements

```python
from latitude_telemetry import LatitudeSpanProcessor, RedactSpanProcessorOptions

processor = LatitudeSpanProcessor(
    "api-key",
    "project-slug",
    LatitudeSpanProcessorOptions(
        disable_redact=True,  # Disable all redaction
        redact=RedactSpanProcessorOptions(
            attributes=[r"^password$", r"secret"],
            mask=lambda attr, value: "[REDACTED]",
        ),
    ),
)
```

### Custom Filtering

```python
processor = LatitudeSpanProcessor(
    "api-key",
    "project-slug",
    LatitudeSpanProcessorOptions(
        should_export_span=lambda span: span.attributes.get("custom") is True,
        blocked_instrumentation_scopes=["opentelemetry.instrumentation.fs"],
    ),
)
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002` | OTLP exporter endpoint |

## Troubleshooting

### Spans not appearing in Latitude

1. **Check API key and project slug**: Must be non-empty strings.
2. **Verify instrumentations are registered**: Use `register_latitude_instrumentations()`.
3. **Flush before exit**: Call `latitude.flush()` or `provider.force_flush()`.
4. **Check smart filter**: Only LLM spans are exported by default. Use `disable_smart_filter=True` to export all spans.
5. **Ensure `capture()` wraps the code that creates spans**: `capture()` itself doesn't create spans; it only attaches context.

### No spans created inside `capture()`

`capture()` only attaches context. You need:

1. An active instrumentation (e.g., `opentelemetry-instrumentation-openai`).
2. That instrumentation to create spans for the operations inside your callback.

### Context not propagating

Ensure you have a functioning OpenTelemetry context propagator registered:

```python
from opentelemetry.context import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

set_global_textmap(
    CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()])
)
```

`init_latitude()` does this automatically. For shared-provider setups, your existing OTel setup should already have this.
