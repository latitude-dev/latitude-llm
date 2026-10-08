---
title: Python SDK
description: Instrument Python apps with Latitude Telemetry.
---

import SkillsCallout from "/snippets/skills-callout.mdx"
import FirstArtifact from "/snippets/first-artifact.mdx"

# Python SDK

Use `latitude-telemetry` to send LLM traces from Python applications to Latitude. The SDK is built on OpenTelemetry and can attach to an existing tracing setup when your app already uses one. No Latitude account yet? Your agent can create a temporary one and do this whole setup with the [`latitude-setup` skill](/getting-started/skills), no signup.

<SkillsCallout />

## Installation

You need a Latitude API key and a project slug. No account yet? Your agent can create a temporary one with the [`latitude-setup` skill](/getting-started/skills), no signup.

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

## See what was captured

<FirstArtifact />

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

If callback wrapping does not fit your control flow, use lifecycle mode:

```python
scope = capture.start(
    "handle-user-request",
    {
        "user_id": "user_123",
        "session_id": "session_abc",
        "project": "support-agent",
    },
)

try:
    run_agent()
except Exception as error:
    capture.end(scope, error)
    raise

capture.end(scope)
```

Nested `capture()` calls inherit parent context and can override local values. Metadata is shallow-merged, and tags are appended and deduplicated.

## Bring your own cost

By default Latitude prices each LLM call from its token counts using public model prices. If you pay a negotiated rate, use a fine-tuned or self-hosted model, or already know what each call cost, tell the SDK and Latitude uses your figure instead. All amounts are in USD.

There are four ways to set it. When more than one applies to the same span, the first in this list wins:

1. **`set_llm_cost(span, input=, output=, total=)`**: the cost of one specific span you hold.
2. **`capture(name, ..., cost=...)`**: a cost per LLM call, applied to every LLM call inside that capture.
3. **`cost_resolver`**: a function that prices each LLM call.
4. **`pricing`**: a per-model price table.

If none of them sets a cost, Latitude prices the span itself, as before.

```python
import openai

from latitude_telemetry import Latitude, LlmCost, LlmUsage, capture, set_llm_cost


def resolve_cost(usage: LlmUsage) -> LlmCost | None:
    if usage.model and usage.model.startswith("ft:"):
        return {"total": (usage.input_tokens or 0) * 3 / 1_000_000}
    return None  # fall back to `pricing`, then to Latitude's own prices


latitude = Latitude(
    api_key="your-api-key",
    project="my-project",
    instrumentations={"openai": openai},
    # USD per 1M tokens, keyed by "<provider>/<model>" (case-insensitive)
    pricing={
        "openai/gpt-4o": {"input_per_1m": 2.0, "output_per_1m": 8.0},
        "openai/text-embedding-3-small": {"input_per_1m": 0.015},
    },
    cost_resolver=resolve_cost,
)


# Per LLM call: EACH LLM call inside this capture costs $0.002 in and $0.004 out
@capture("handle-user-request", cost={"input": 0.002, "output": 0.004})
def handle_request():
    ...
```

`cost` can also go in the options dict: `capture("run", fn, {"cost": {"total": 0.01}})`.

A cost is a dict: either `{"input": ..., "output": ...}`, `{"total": ...}`, or all three. When you leave out `total`, the SDK sets it to `input + output`. An explicit `0` is a real cost of zero, not "unset". Negative or non-numeric amounts are ignored with a warning.

<Warning>
  **`capture(cost=...)` is a cost per LLM call.** It is applied to **every** LLM call inside the capture, not split across them, so a capture that makes 3 LLM calls records 3× the cost. If the calls inside a capture cost different amounts, use `pricing=` or `cost_resolver=` to price each call, or `set_llm_cost()` for one specific span.
</Warning>

```python
# 3 LLM calls inside one capture, each with cost {"input": 0.002, "output": 0.004}
@capture("research-agent", cost={"input": 0.002, "output": 0.004})
def research_agent():
    plan = client.chat.completions.create(...)    # span cost: total $0.006
    answer = client.chat.completions.create(...)  # span cost: total $0.006
    review = client.chat.completions.create(...)  # span cost: total $0.006
    # Trace total: 3 × $0.006 = $0.018. The capture's own wrapper span gets no cost.
```

The capture's own wrapper span never gets a cost. Nested captures inherit the cost unless they set their own.

`set_llm_cost()` writes onto a live span, typically one you created yourself:

```python
with tracer.start_as_current_span(
    "my-llm-call",
    attributes={"gen_ai.operation.name": "chat", "gen_ai.request.model": "my-model"},
) as span:
    set_llm_cost(span, input=0.01, output=0.03)
```

### What the SDK reads and writes

The SDK only prices LLM-call spans: spans whose `gen_ai.operation.name` is `chat`, `text_completion`, `generate_content`, `embeddings` or `rerank`/`reranker`, or the equivalent OpenInference (`openinference.span.kind` `LLM`/`EMBEDDING`/`RERANKER`), OpenLLMetry (`llm.request.type`) or Vercel AI SDK leaf (`ai.*.doGenerate`/`doStream`/`doEmbed`) spans, plus CrewAI's `AGENT` span, which carries its LLM usage. `set_llm_cost()` must be called on one of those LLM-call spans: trace and session totals and the Cost page only count cost on usage operations. Calling it on any other span still sets the cost attributes, and the SDK logs a warning once per process.

For `cost_resolver` and `pricing` it reads the fields below. `cost_resolver` receives them as an `LlmUsage` with `provider`, `model`, `input_tokens`, `output_tokens`, `operation`, `span_name` and `attributes`; any of the first four can be `None`.

| Field | Attributes, first present wins |
| --- | --- |
| provider | `gen_ai.provider.name`, `gen_ai.model.provider`, `gen_ai.system`, `llm.system`, `llm.provider`, `ai.model.provider` (vendor part only, e.g. `openai.chat` → `openai`) |
| model | `gen_ai.response.model`, `gen_ai.request.model`, `llm.model_name`, `ai.model.id` |
| input tokens | `gen_ai.usage.input_tokens`, `gen_ai.usage.prompt_tokens`, `llm.token_count.prompt`, `ai.usage.promptTokens`, `ai.usage.inputTokens` |
| output tokens | `gen_ai.usage.output_tokens`, `gen_ai.usage.completion_tokens`, `llm.token_count.completion`, `ai.usage.completionTokens`, `ai.usage.outputTokens` |

`pricing` tries the response model first, then the requested model. It needs a provider, a matching model and at least one token count, and treats a missing token count or rate as 0. Cache and reasoning tokens are not priced separately. Use `cost_resolver` if you need that; it also receives the span's raw `attributes`. If `cost_resolver` throws, the SDK logs a warning and falls back to `pricing`. Cost is resolved when each span ends, before redaction, so `cost_resolver` runs on your application's thread; keep it fast and side-effect free.

Where the SDK sets a cost it writes the standard `gen_ai.usage.input_cost`, `gen_ai.usage.output_cost` and `gen_ai.usage.total_cost` attributes plus `latitude.cost.source = "user"` (exported as `ATTRIBUTES.cost_input`, `cost_output`, `cost_total`, `cost_source` and `COST_SOURCE_USER`). It replaces any cost your instrumentation already wrote on that span, including a `total`-only cost removing the instrumentation's input and output costs so the numbers stay consistent. Spans the SDK doesn't price keep whatever cost the instrumentation wrote. The cost is written as the span is exported to Latitude, so other exporters on the same OpenTelemetry provider see the span unchanged.

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
| Amazon SageMaker | `boto3` | `{"sagemaker": boto3}` |
| Cohere | `cohere` | `{"cohere": cohere}` |
| LangChain | `langchain-core` | `{"langchain": langchain_core}` |
| LlamaIndex | `llama-index` | `{"llamaindex": llama_index}` |
| CrewAI | `crewai` | `{"crewai": crewai}` |
| Haystack | `haystack-ai` | `{"haystack": haystack}` |
| Together AI | `together` | `{"togetherai": together}` |
| Vertex AI | `google-cloud-aiplatform` | `{"vertexai": vertexai}` |
| Google AI Platform | `google-cloud-aiplatform` | `{"aiplatform": aiplatform}` |
| Google ADK | `google-adk` | `{"google_adk": google.adk}` |
| Google Gemini | `google-genai` | `{"google_generativeai": genai}` |
| Groq | `groq` | `{"groq": groq}` |
| LiteLLM | `litellm` | `{"litellm": litellm}` |
| Mistral AI | `mistralai` | `{"mistralai": mistralai}` |
| Ollama | `ollama` | `{"ollama": ollama}` |
| Replicate | `replicate` | `{"replicate": replicate}` |
| IBM watsonx.ai | `ibm-watsonx-ai` | `{"watsonx": ibm_watsonx_ai}` |
| Aleph Alpha | `aleph-alpha-client` | `{"aleph_alpha": aleph_alpha_client}` |
| Transformers | `transformers` | `{"transformers": transformers}` |
| DSPy | `dspy` | via litellm → `{"litellm": litellm}` |

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
