---
title: Python SDK
description: Instrument Python apps with Latitude Telemetry.
---

# Python SDK

Use `latitude-telemetry` to send LLM traces from Python applications to Latitude. The SDK is built on OpenTelemetry and can attach to an existing tracing setup when your app already uses one.

## Installation

```bash
pip install latitude-telemetry
```

Requires Python 3.11+.

## Bootstrap

Initialize Latitude once, before your LLM calls run. Pass the LLM SDK modules your app uses through `instrumentations` so Latitude can auto-instrument them.

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

`instrumentations` should use the same package module your application imports for the actual LLM call.

## Add context with `capture()`

Auto-instrumentation creates spans for supported LLM calls. Use `capture()` to attach Latitude context to the spans created inside a request, conversation turn, or agent run.

You can use `capture()` to:

- group traces by **user**
- group traces into a **session**
- route traces to a specific **project**
- add tags and metadata for filtering
- mark the boundary of an agent run

```python
import openai
from openai import OpenAI

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key="your-api-key",
    project="your-project-slug",
    instrumentations={"openai": openai},
)

client = OpenAI()

capture(
    "handle-user-request",
    lambda: client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": user_message}],
    ),
    {
        "user_id": "user_123",
        "session_id": "session_abc",
        "project": "support-agent",
        "tags": ["production", "v2-agent"],
        "metadata": {"request_id": "req-xyz"},
    },
)

latitude.shutdown()
```

`capture()` does not create spans by itself. It only adds context to spans created by auto-instrumentation inside the callback. In most apps, wrap the outer request handler, conversation turn, or agent entrypoint once.

Nested `capture()` calls inherit parent context and can override local values. Metadata is shallow-merged, and tags are appended and deduplicated.

## Existing OpenTelemetry setup

If your app already has an OpenTelemetry provider, add Latitude to the existing setup and register the LLM instrumentations against that provider.

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

`LatitudeSpanProcessor` exports spans to Latitude. You still need LLM instrumentations to create those spans.

If you need lower-level OpenTelemetry wiring or a non-Python runtime, see the [OpenTelemetry Exporter](/telemetry/otel-exporter) guide.

## Supported integrations

Set the integration key on `instrumentations` to the SDK module your app imports.

| Integration | Package | Example |
| --- | --- | --- |
| OpenAI | `openai` | `{"openai": openai}` |
| OpenAI Agents SDK | `openai-agents` | `{"openai-agents": agents}` |
| Anthropic | `anthropic` | `{"anthropic": anthropic}` |
| Amazon Bedrock | `boto3` | `{"bedrock": boto3}` |
| Cohere | `cohere` | `{"cohere": cohere}` |
| LangChain | `langchain-core` | `{"langchain": langchain_core}` |
| LlamaIndex | `llama-index` | `{"llamaindex": llama_index}` |
| Together AI | `together` | `{"togetherai": together}` |
| Vertex AI | `google-cloud-aiplatform` | `{"vertexai": vertexai}` |
| Google AI Platform | `google-cloud-aiplatform` | `{"aiplatform": aiplatform}` |
| Google Generative AI | `google-generativeai` | `{"google_generativeai": genai}` |
| Groq | `groq` | `{"groq": groq}` |
| LiteLLM | `litellm` | `{"litellm": litellm}` |
| Mistral AI | `mistralai` | `{"mistralai": mistralai}` |
| Ollama | `ollama` | `{"ollama": ollama}` |
| Replicate | `replicate` | `{"replicate": replicate}` |
| Transformers | `transformers` | `{"transformers": transformers}` |

For provider-specific setup notes, use the provider and framework pages in the Observability sidebar.

## Troubleshooting

### Spans are not appearing in Latitude

Start with the most common setup issues.

#### Check the API key and project slug

Make sure both values are present in the runtime where your app is executing:

```python
latitude = Latitude(
    api_key="your-api-key",
    project="your-project-slug",
    instrumentations={"openai": openai},
)
```

If either value is missing or points to the wrong organization/project, Latitude cannot route the spans to your project.

#### Pass the same SDK module your app uses

The module passed to `instrumentations` should be the same package import used for the actual LLM call.

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

client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)
```

Avoid importing one SDK module for instrumentation and using a different wrapper or separately loaded copy for the LLM call.

#### Flush before short-lived processes exit

Servers can usually export spans in the background. Scripts, CLIs, tests, and jobs that exit immediately should flush before shutdown:

```python
try:
    client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )

    latitude.flush()
finally:
    latitude.shutdown()
```

#### Wrap the actual LLM call with `capture()`

If you use `capture()`, the instrumented operation must happen inside the callback:

```python
capture(
    "support-agent-turn",
    lambda: client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": user_message}],
    ),
    {
        "user_id": user.id,
        "session_id": conversation.id,
        "project": "support-agent",
    },
)
```

This will not attach context to the LLM call, because the call happens before `capture()` starts:

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": user_message}],
)

capture(
    "support-agent-turn",
    lambda: response,
    {
        "user_id": user.id,
        "session_id": conversation.id,
    },
)
```

#### Consume streaming responses inside `capture()`

For streaming responses, create and consume the stream inside the `capture()` callback. This keeps the full streamed operation inside the active OpenTelemetry context.

```python
def stream_support_agent_turn():
    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": user_message}],
        stream=True,
    )

    for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            print(content, end="")

capture(
    "stream-support-agent-turn",
    stream_support_agent_turn,
    {
        "user_id": user.id,
        "session_id": conversation.id,
        "project": "support-agent",
    },
)
```

Avoid returning the stream from `capture()` and consuming it later. Once the callback has finished, the Latitude context is no longer active for the remaining stream consumption.

### No spans are created inside `capture()`

`capture()` only attaches context. You still need a supported instrumentation, and the code inside the callback must make an instrumented LLM call.

### Context is not propagating

`Latitude(...)` registers OpenTelemetry context propagation when it owns the provider. If you provide your own OpenTelemetry setup, make sure it has working context propagation before Latitude attaches to it.
