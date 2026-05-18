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

The fastest way to start. One class sets up a complete OpenTelemetry pipeline with LLM auto-instrumentation and the Latitude exporter:

```python
import openai
from openai import OpenAI

from latitude_telemetry import Latitude

latitude = Latitude(
    api_key="your-api-key",
    project="your-project-slug",
    instrumentations={"openai": openai},
)

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

latitude.shutdown()
```

`instrumentations` takes a dict mapping integration name (`openai`, `anthropic`, …) to the LLM SDK module the consumer imports. Passing the user's own module reference sidesteps a class of import-cache bugs where the SDK could patch a different module instance than the app loads.

## Using `capture()` for Context

Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` when you want to:

- **Group traces by user or session**: Track all LLM calls from a specific user
- **Add business context**: Tag traces with environment, feature flags, or request IDs
- **Mark agent boundaries**: Wrap an agent run or conversation turn with a name and metadata
- **Filter and analyze**: Use tags and metadata to filter traces in Latitude

```python
import openai

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key="your-api-key",
    project="your-project-slug",
    instrumentations={"openai": openai},
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
import openai

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from latitude_telemetry import LatitudeSpanProcessor, register_latitude_instrumentations

provider = TracerProvider()
provider.add_span_processor(LatitudeSpanProcessor("api-key", "project-slug"))

trace.set_tracer_provider(provider)

register_latitude_instrumentations(
    instrumentations={"openai": openai},
    tracer_provider=provider,
)
```

`LatitudeSpanProcessor` only exports spans to Latitude. You still need LLM instrumentations to create those spans. Use `register_latitude_instrumentations()` or bring your own OTel-compatible LLM instrumentation.

For examples of integrating with **Datadog**, **Sentry**, or other observability platforms, see the [OpenTelemetry Exporter](otel-exporter) guide. That guide also covers connecting from **any language** beyond TypeScript and Python.

## Public API Reference

```python
from latitude_telemetry import (
    Latitude,
    LatitudeOptions,
    LatitudeSpanProcessor,
    capture,
    register_latitude_instrumentations,
)
```

### `Latitude(**options)`

Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export. If an OpenTelemetry provider is already registered, Latitude attaches its span processor to that provider instead of replacing it.

```python
class Latitude:
    def __init__(
        self,
        *,
        api_key: str,
        # Default project for spans. Optional — every `capture()` can override.
        # Sent as the `X-Latitude-Project` header on every export.
        project: str | None = None,
        # DEPRECATED alias for `project`. Still accepted; logs a one-time warning.
        project_slug: str | None = None,
        # Dict mapping integration name → the LLM SDK module the consumer imports.
        # Anything else (list, primitive, unknown key, non-dict) raises TypeError.
        instrumentations: InstrumentationsInput | None = None,
        service_name: str | None = None,
        disable_batch: bool = False,
        disable_smart_filter: bool = False,
        should_export_span: Callable[[ReadableSpan], bool] | None = None,
        blocked_instrumentation_scopes: list[str] | None = None,
        disable_redact: bool = False,
        redact: RedactSpanProcessorOptions | None = None,
        exporter: SpanExporter | None = None,
        tracer_provider: TracerProvider | None = None,
    ):
        ...

    provider: TracerProvider
    def flush(self) -> None: ...
    def shutdown(self) -> None: ...
```

`init_latitude()` remains available as a backwards-compatible wrapper that returns `{"provider", "flush", "shutdown"}`.

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
#     "project": str | None,        # Route this capture (and child spans) to a
#                                   # specific Latitude project, overriding the default.
#     "project_slug": str | None,   # DEPRECATED alias for `project`. Still accepted.
# }
```

| Option | Type | OTel Attribute | Description |
|---|---|---|---|
| `name` | `str` | `latitude.capture.name` | Name for the capture context |
| `tags` | `list[str]` | `latitude.tags` | Tags for filtering traces |
| `metadata` | `dict[str, Any]` | `latitude.metadata` | Arbitrary key-value metadata |
| `session_id` | `str` | `session.id` | Group traces by session |
| `user_id` | `str` | `user.id` | Associate traces with a user |
| `project` | `str` | `latitude.project` | Route this capture to a specific Latitude project (overrides the constructor default) |

### `LatitudeSpanProcessor`

Span processor for shared-provider setups. Reads Latitude context from OTel context and stamps attributes onto spans.

```python
class LatitudeSpanProcessor:
    def __init__(
        self,
        api_key: str,
        project: str | None,
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
    exporter: SpanExporter | None = None
    service_name: str | None = None
```

### `register_latitude_instrumentations(instrumentations, tracer_provider)`

Registers LLM auto-instrumentations against a specific tracer provider.

```python
# InstrumentationName = Literal[
#   "openai", "openai-agents", "anthropic", "bedrock", "cohere",
#   "langchain", "llamaindex", "togetherai", "vertexai", "aiplatform",
#   "aleph_alpha", "crewai", "dspy", "google_generativeai", "groq",
#   "haystack", "litellm", "mistralai", "ollama", "replicate",
#   "sagemaker", "transformers", "watsonx",
# ]
# InstrumentationsInput = dict[InstrumentationName, object]

def register_latitude_instrumentations(
    # Dict mapping integration name → the LLM SDK module the consumer imports.
    # Anything else throws at register time.
    instrumentations: InstrumentationsInput,
    tracer_provider: TracerProvider,
) -> None:
    ...
```

## Migrating from `instrumentations=["openai"]` (3.0.0a6 and earlier)

The list-of-strings form is removed with no fallback in `3.0.0a7`. Anything other than a plain dict raises `TypeError` at register time. Migration:

```diff
- from latitude_telemetry import Latitude
+ import openai
+ import anthropic
+ from latitude_telemetry import Latitude

  latitude = Latitude(
      api_key="your-api-key",
      project="your-project-slug",
-     instrumentations=["openai", "anthropic"],
+     instrumentations={"openai": openai, "anthropic": anthropic},
  )
```

## Supported Providers

Set the integration's key on the `instrumentations` dict to the LLM SDK module the consumer imports.

| Key                   | PyPI package                  | What to pass                                |
| --------------------- | ----------------------------- | ------------------------------------------- |
| `openai`              | `openai`                      | `import openai` → `openai`                  |
| `openai-agents`       | `openai-agents`               | `import agents` → `agents`                  |
| `anthropic`           | `anthropic`                   | `import anthropic` → `anthropic`            |
| `bedrock`             | `boto3`                       | `import boto3` → `boto3`                    |
| `cohere`              | `cohere`                      | `import cohere` → `cohere`                  |
| `langchain`           | `langchain-core`              | `import langchain_core` → that module       |
| `llamaindex`          | `llama-index`                 | `import llama_index` → that module          |
| `togetherai`          | `together`                    | `import together` → `together`              |
| `vertexai`            | `google-cloud-aiplatform`     | `import vertexai` → `vertexai`              |
| `aiplatform`          | `google-cloud-aiplatform`     | `import google.cloud.aiplatform` → that module |
| `aleph_alpha`         | `aleph-alpha-client`          | `import aleph_alpha_client`                 |
| `crewai`              | `crewai`                      | `import crewai`                             |
| `dspy`                | `dspy-ai`                     | `import dspy`                               |
| `google_generativeai` | `google-generativeai`         | `from google import genai` → `genai`        |
| `groq`                | `groq`                        | `import groq`                               |
| `haystack`            | `haystack-ai`                 | `import haystack`                           |
| `litellm`             | `litellm`                     | `import litellm`                            |
| `mistralai`           | `mistralai`                   | `import mistralai`                          |
| `ollama`              | `ollama`                      | `import ollama`                             |
| `replicate`           | `replicate`                   | `import replicate`                          |
| `sagemaker`           | `boto3`                       | `import boto3` → `boto3`                    |
| `transformers`        | `transformers`                | `import transformers`                       |
| `watsonx`             | `ibm-watson-machine-learning` | `import ibm_watsonx_ai`                     |

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
2. **Verify instrumentations are registered**: Create `Latitude(...)` before importing or constructing clients when possible, or use `register_latitude_instrumentations()` for manual setups.
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

`Latitude(...)` does this automatically when it owns the provider. For shared-provider setups, your existing OTel setup should already have this.
