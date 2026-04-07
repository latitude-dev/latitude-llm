# Latitude Telemetry for Python

Instrument your AI application and send traces to [Latitude](https://latitude.so). Built on [OpenTelemetry](https://opentelemetry.io/).

## Installation

```sh
pip install latitude-telemetry
```

Requires Python 3.11+.

## Quick Start

### Bootstrap (Recommended)

The fastest way to start tracing your LLM calls. One function sets up everything:

```python
from latitude_telemetry import init_latitude

latitude = init_latitude(
    api_key="your-api-key",
    project_slug="your-project-slug",
    instrumentations=["openai"],  # Auto-instrument OpenAI, Anthropic, etc.
)

# Your LLM calls will now be traced and sent to Latitude
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
)

latitude.shutdown()
```

**What this does:**

- Creates a complete OpenTelemetry setup
- Registers LLM auto-instrumentation (OpenAI, Anthropic, etc.)
- Configures the Latitude span processor and exporter
- Sets up async context propagation (for passing context through async operations)

**When to use this:** Most applications should start here. It's the simplest path to get LLM observability into Latitude.

**When you might need the advanced setup:**

- You already have OpenTelemetry configured for other backends (Datadog, Sentry, Jaeger)
- You need custom span processing, sampling, or filtering
- You want multiple observability backends receiving the same spans

### Existing OpenTelemetry Setup (Advanced)

If your app already uses OpenTelemetry, add Latitude alongside your existing setup:

```python
from opentelemetry.sdk.trace import TracerProvider
from latitude_telemetry import LatitudeSpanProcessor, register_latitude_instrumentations

provider = TracerProvider()
# Add Latitude as an additional processor
provider.add_span_processor(LatitudeSpanProcessor("api-key", "project-slug"))
# Add your other processors (Datadog, console exporter, etc.)

provider.register()

# Enable LLM auto-instrumentation
register_latitude_instrumentations(
    instrumentations=["openai"],
    tracer_provider=provider,
)

# Your LLM calls will now be traced and sent to Latitude
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
)
```

**Important:** `LatitudeSpanProcessor` only exports spans to Latitude. You still need LLM instrumentations to create those spans—use `register_latitude_instrumentations()` or bring your own OTel-compatible LLM instrumentation.

## Using `capture()` for Context and Boundaries

The SDK automatically traces LLM calls when you use auto-instrumentation. However, you may want to add additional context (user ID, session ID, tags, or metadata) to group related spans together.

### What `capture()` Does

`capture()` wraps your code to attach Latitude context to all LLM spans created inside the callback:

- Adds attributes like `user.id`, `session.id`, `latitude.tags`, and `latitude.metadata` to every span
- Creates a named boundary for grouping related traces
- Uses OpenTelemetry's native context API for reliable async propagation

### When to Use It

You don't need `capture()` to get started—auto-instrumentation handles LLM calls automatically. Use `capture()` when you want to:

- **Group traces by user or session** — Track all LLM calls from a specific user or session
- **Add business context** — Tag traces with deployment environment, feature flags, or request IDs
- **Mark agent boundaries** — Wrap an entire agent run or conversation turn with a name and metadata
- **Filter and analyze** — Use tags and metadata to filter traces in the Latitude UI

### Example

```python
from latitude_telemetry import init_latitude, capture

latitude = init_latitude(
    api_key="your-api-key",
    project_slug="your-project-slug",
    instrumentations=["openai"],
)

# Wrap a request or agent run to add context
capture(
    "handle-user-request",
    lambda: agent.process(user_message),
    {
        "user_id": "user_123",
        "session_id": "session_abc",
        "tags": ["production", "v2-agent"],
        "metadata": {"request_id": "req-xyz", "feature_flag": "new-prompt"},
    },
)

latitude.shutdown()
```

**Important:** `capture()` does not create spans—it only attaches context. The LLM spans are created by the auto-instrumentation. You only need one `capture()` call at the request or agent boundary, not for every internal step.

## Key Concepts

- **`init_latitude()`** — The primary way to use Latitude. Bootstraps a complete OpenTelemetry setup with LLM auto-instrumentation and the Latitude exporter. Best for most applications.
- **`LatitudeSpanProcessor`** — For advanced use cases where you already have an OpenTelemetry setup. Exports spans to Latitude alongside your existing observability stack.
- **`register_latitude_instrumentations()`** — Registers LLM auto-instrumentations (OpenAI, Anthropic, etc.) when using the advanced setup with your own provider.
- **`capture()`** — Optional. Wraps your code to attach Latitude context (tags, user_id, session_id, metadata) to all spans created inside the callback. Use this when you want to group traces by user, session, or add business context.

**Important:** Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` only when you need to add context or mark boundaries. Wrap the request, job, or agent entrypoint once—you don't need to wrap every internal step.

### Why OpenTelemetry?

Latitude Telemetry is built entirely on OpenTelemetry standards. When you're ready to add other observability tools (Datadog, Sentry, Jaeger, etc.), you can use them alongside Latitude without conflicts:

- **Standard span processors** — `LatitudeSpanProcessor` works with any `TracerProvider`
- **Smart filtering** — Only LLM-relevant spans are exported to Latitude (spans with `gen_ai.*`, `llm.*`, `openinference.*`, or `ai.*` attributes, plus known LLM instrumentation scopes)
- **Compatible with existing instrumentations** — Works alongside HTTP, DB, and other OTel instrumentations
- **No vendor lock-in** — Standard OTLP export, no proprietary wire format

## Public API

```python
from latitude_telemetry import (
    init_latitude,
    LatitudeSpanProcessor,
    capture,
    register_latitude_instrumentations,
)
```

### `init_latitude(api_key, project_slug, **options)`

The primary entry point. Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export.

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
#     "provider": TracerProvider,  # Access to underlying provider for advanced use
#     "flush": Callable[[], None],   # Flush spans to Latitude
#     "shutdown": Callable[[], None],  # Graceful shutdown
# }
```

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
    disable_batch: bool = False
    disable_smart_filter: bool = False
    should_export_span: Callable[[ReadableSpan], bool] | None = None
    blocked_instrumentation_scopes: tuple[str, ...] = ()
```

### `capture(name, fn, options=None)`

Wraps a function to attach Latitude context to all spans created inside. Uses OpenTelemetry's native context API for scoping.

```python
def capture(
    name: str,
    fn: Callable[[], T],
    options: ContextOptions | None = None,
) -> T:
    ...

# ContextOptions:
# {
#     "name": str | None,        # Override the capture name
#     "user_id": str | None,     # User identifier (session.id attribute)
#     "session_id": str | None,  # Session identifier (user.id attribute)
#     "tags": list[str] | None,  # Tags for filtering traces
#     "metadata": dict | None,   # Arbitrary key-value metadata
# }
```

**Nested `capture()` behavior:**

- `user_id`: last-write-wins
- `session_id`: last-write-wins
- `metadata`: shallow merge
- `tags`: append and dedupe while preserving order

### `register_latitude_instrumentations(instrumentations, tracer_provider)`

Registers LLM auto-instrumentations against a specific tracer provider.

```python
def register_latitude_instrumentations(
    instrumentations: list[str],
    tracer_provider: TracerProvider,
) -> None:
    ...
```

## Supported AI Providers

| Identifier     | Package                           |
| -------------- | --------------------------------- |
| `"openai"`     | `openai`                          |
| `"anthropic"`  | `anthropic`                       |
| `"bedrock"`    | `boto3`                           |
| `"cohere"`     | `cohere`                          |
| `"langchain"`  | `langchain-core`                  |
| `"llamaindex"` | `llama-index`                     |
| `"togetherai"` | `together`                        |
| `"vertexai"`   | `google-cloud-aiplatform`         |
| `"aiplatform"` | `google-cloud-aiplatform`         |

## Context Options

`capture()` accepts these context options:

| Option       | Type                 | OTel Attribute          | Description                  |
| ------------ | -------------------- | ----------------------- | ---------------------------- |
| `name`       | `str`                | `latitude.capture.name` | Name for the capture context |
| `tags`       | `list[str]`          | `latitude.tags`         | Tags for filtering traces    |
| `metadata`   | `dict[str, Any]`     | `latitude.metadata`     | Arbitrary key-value metadata |
| `session_id` | `str`                | `session.id`            | Group traces by session      |
| `user_id`    | `str`                | `user.id`               | Associate traces with a user |

## Configuration Options

### Smart Filtering

By default, only LLM-relevant spans are exported:

```python
from latitude_telemetry import LatitudeSpanProcessor

processor = LatitudeSpanProcessor(
    "api-key",
    "project-slug",
    LatitudeSpanProcessorOptions(
        disable_smart_filter=True,  # Export all spans
    ),
)
```

### Redaction

PII redaction is enabled by default for security-sensitive attributes only:

**Redacted by default:**

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
            attributes=[r"^password$", r"secret"],  # Add custom patterns
            mask=lambda attr, value: "[REDACTED]",
        ),
    ),
)
```

### Custom Filtering

```python
from latitude_telemetry import LatitudeSpanProcessor, LatitudeSpanProcessorOptions

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

| Variable                 | Default                   | Description            |
| ------------------------ | ------------------------- | ---------------------- |
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002`   | OTLP exporter endpoint |

## Troubleshooting

### Spans not appearing in Latitude

1. **Check API key and project slug** — Must be non-empty strings
2. **Verify instrumentations are registered** — Use `register_latitude_instrumentations()`
3. **Flush before exit** — Call `latitude.flush()` or `provider.force_flush()`
4. **Check smart filter** — Only LLM spans are exported by default. Use `disable_smart_filter=True` to export all spans
5. **Ensure `capture()` wraps the code that creates spans** — `capture()` itself doesn't create spans; it only attaches context to spans created by instrumentations

### No spans created inside `capture()`

`capture()` only attaches context. You need:

1. An active instrumentation (e.g., `opentelemetry-instrumentation-openai`)
2. That instrumentation to create spans for the operations inside your callback

### Context not propagating

Ensure you have a functioning OpenTelemetry context manager registered:

```python
from opentelemetry.context import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

set_global_textmap(
    CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()])
)
```

`init_latitude()` does this automatically. For shared-provider setups, your app's existing OTel setup should already have this.

## License

MIT
