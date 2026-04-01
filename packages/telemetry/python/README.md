# Latitude Telemetry for Python

Instrument your AI application and send traces to [Latitude](https://latitude.so). Built on [OpenTelemetry](https://opentelemetry.io/).

## Installation

```sh
pip install latitude-telemetry
```

Requires Python 3.11+.

## Quick Start

```python
from openai import OpenAI
from latitude_telemetry import Telemetry, TelemetryOptions, Instrumentors

telemetry = Telemetry("your-api-key", "your-project-slug", TelemetryOptions(
    instrumentors=[Instrumentors.OpenAI],
))

# All OpenAI calls are now automatically traced
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)

# Ensure traces are sent before process exits
telemetry.flush()
```

## Constructor

```python
Telemetry(api_key: str, project_slug: str, options: TelemetryOptions | None = None)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `api_key` | `str` | Your Latitude API key |
| `project_slug` | `str` | Your Latitude project slug |
| `options` | `TelemetryOptions` | Optional configuration |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `service_name` | `str` | `"latitude-telemetry-python"` | Service name reported in traces |
| `instrumentors` | `list[Instrumentors]` | `[]` | Providers to auto-instrument |
| `disable_batch` | `bool` | `False` | Send spans immediately instead of batching |

## Auto-Instrumentation

Pass the provider names to automatically instrument all calls:

```python
from latitude_telemetry import Telemetry, TelemetryOptions, Instrumentors

telemetry = Telemetry("your-api-key", "your-project-slug", TelemetryOptions(
    instrumentors=[
        Instrumentors.OpenAI,
        Instrumentors.Anthropic,
    ],
))
```

### Supported Providers

| Instrumentor | Package |
|--------------|---------|
| `Instrumentors.OpenAI` | `openai` |
| `Instrumentors.Anthropic` | `anthropic` |
| `Instrumentors.Bedrock` | `boto3` |
| `Instrumentors.Cohere` | `cohere` |
| `Instrumentors.CrewAI` | `crewai` |
| `Instrumentors.DSPy` | `dspy` / `dspy-ai` |
| `Instrumentors.GoogleGenerativeAI` | `google-generativeai` |
| `Instrumentors.Groq` | `groq` |
| `Instrumentors.Haystack` | `haystack-ai` |
| `Instrumentors.Langchain` | `langchain-core` |
| `Instrumentors.LiteLLM` | `litellm` |
| `Instrumentors.LlamaIndex` | `llama-index` |
| `Instrumentors.MistralAI` | `mistralai` |
| `Instrumentors.Ollama` | `ollama` |
| `Instrumentors.Replicate` | `replicate` |
| `Instrumentors.Sagemaker` | `boto3` |
| `Instrumentors.Together` | `together` |
| `Instrumentors.Transformers` | `transformers` |
| `Instrumentors.VertexAI` | `google-cloud-aiplatform` |
| `Instrumentors.Watsonx` | `ibm-watsonx-ai` |

## Capture

Use `capture()` to set trace-wide context attributes. Works as a decorator or context manager. All spans created within the scope inherit the attributes as baggage:

### Decorator

```python
@telemetry.capture(
    tags=["production", "chat"],
    metadata={"environment": "prod", "version": "1.2.0"},
    session_id="session-abc-123",
    user_id="user-456",
)
def generate_reply(message: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
    )
    return response.choices[0].message.content
```

### Context Manager

```python
with telemetry.capture(session_id="session-abc", user_id="user-123"):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello!"}],
    )
```

### Async

```python
@telemetry.capture(tags=["async"])
async def generate_reply(message: str) -> str:
    response = await async_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
    )
    return response.choices[0].message.content
```

### Capture Options

| Option | Type | OTel Attribute | Description |
|--------|------|----------------|-------------|
| `tags` | `list[str]` | `latitude.tags` | Tags for filtering traces |
| `metadata` | `dict[str, Any]` | `latitude.metadata` | Arbitrary key-value metadata |
| `session_id` | `str` | `session.id` | Group traces by session |
| `user_id` | `str` | `user.id` | Associate traces with a user |

## Custom Spans

The SDK exposes the underlying OpenTelemetry `tracer` for creating custom spans:

```python
# Simple span
with telemetry.tracer.start_as_current_span("my-operation") as span:
    span.set_attribute("custom.key", "value")
    # your code here

# Manual span management
span = telemetry.tracer.start_span("my-operation")
span.set_attribute("custom.key", "value")
span.end()
```

## Lifecycle

```python
# Force flush pending spans
telemetry.flush()

# Shutdown (flushes then closes)
telemetry.shutdown()

# Disable all instrumentors
telemetry.uninstrument()
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002` | OTLP exporter endpoint |

## Development

Requires [uv](https://docs.astral.sh/uv/) 0.5.10+.

```sh
uv venv && uv sync --all-extras --all-groups
uv run scripts/test.py      # run tests
uv run scripts/lint.py      # run linter
uv run scripts/format.py    # run formatter
```

## License

MIT
