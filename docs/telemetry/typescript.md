---
title: TypeScript SDK
description: Instrument TypeScript and JavaScript apps with Latitude Telemetry.
---

import SkillsCallout from "/snippets/skills-callout.mdx"
import FirstArtifact from "/snippets/first-artifact.mdx"

# TypeScript SDK

Use `@latitude-data/telemetry` to send LLM traces from TypeScript and JavaScript applications to Latitude. The SDK is built on OpenTelemetry and can attach to an existing tracing setup when your app already uses one. No Latitude account yet? Your agent can create a temporary one and do this whole setup with the [`latitude-setup` skill](/getting-started/skills), no signup.

<SkillsCallout />

## Installation

You need a Latitude API key and a project slug. No account yet? Your agent can create a temporary one with the [`latitude-setup` skill](/getting-started/skills), no signup.

```bash
npm install @latitude-data/telemetry openai
```

Provider instrumentation implementations are included with `@latitude-data/telemetry`. Importing a factory from an opt-in subpath keeps unused instrumentations out of your application bundle.

## Bootstrap

Initialize Latitude once before your LLM calls run. Import an instrumentation factory from its opt-in subpath and pass the created instance through `instrumentations`.

```ts
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import { Latitude } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready
const client = new OpenAI()

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
})

await latitude.shutdown()
```

`new Latitude()` returns immediately. Await `latitude.ready` before creating LLM clients or making calls.

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

```ts
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import { Latitude, capture } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready
const client = new OpenAI()

await capture(
  "handle-user-request",
  async () => {
    return client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
    })
  },
  {
    userId: "user_123",
    sessionId: "session_abc",
    project: "support-agent",
    tags: ["production", "v2-agent"],
    metadata: { requestId: "req-xyz" },
  },
)

await latitude.shutdown()
```

`capture()` does not create spans by itself. It only adds context to spans created by auto-instrumentation inside the callback. In most apps, wrap the outer request handler, conversation turn, or agent entrypoint once.

If callback wrapping does not fit your control flow, use lifecycle mode:

```ts
const scope = capture.start("handle-user-request", {
  userId: "user_123",
  sessionId: "session_abc",
  project: "support-agent",
})

try {
  await runAgent()
} catch (error) {
  capture.end(scope, error)
  throw error
}

capture.end(scope)
```

Nested `capture()` calls inherit parent context and can override local values. Metadata is shallow-merged, and tags are appended and deduplicated.

## Bring your own cost

By default Latitude prices each LLM call from its token counts using public model prices. If you pay a negotiated rate, use a fine-tuned or self-hosted model, or already know what each call cost, tell the SDK and Latitude uses your figure instead. All amounts are in USD.

There are four ways to set it. When more than one applies to the same span, the first in this list wins:

1. **`setLlmCost(span, cost)`**: the cost of one specific span you hold.
2. **`capture(name, fn, { cost })`**: a cost per LLM call, applied to every LLM call inside that capture.
3. **`costResolver`**: a function that prices each LLM call.
4. **`pricing`**: a per-model price table.

If none of them sets a cost, Latitude prices the span itself, as before.

```ts
import { Latitude, capture, setLlmCost, type LlmUsage } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
  // USD per 1M tokens, keyed by "<provider>/<model>" (case-insensitive)
  pricing: {
    "openai/gpt-4o": { inputPer1M: 2.0, outputPer1M: 8.0 },
    "openai/text-embedding-3-small": { inputPer1M: 0.015 },
  },
  // Return a cost, or undefined to fall back to `pricing` and then to Latitude's own prices
  costResolver: (usage: LlmUsage) =>
    usage.model?.startsWith("ft:") ? { total: ((usage.inputTokens ?? 0) * 3) / 1_000_000 } : undefined,
})

// Per LLM call: EACH LLM call inside this capture costs $0.002 in and $0.004 out
await capture("handle-user-request", () => runAgent(), { cost: { input: 0.002, output: 0.004 } })
```

A cost is either `{ input, output }`, `{ total }`, or all three. When you leave out `total`, the SDK sets it to `input + output`. An explicit `0` is a real cost of zero, not "unset". Negative or non-numeric amounts are ignored with a warning.

<Warning>
  **`capture(name, fn, { cost })` is a cost per LLM call.** It is applied to **every** LLM call inside the capture, not split across them, so a capture that makes 3 LLM calls records 3× the cost. If the calls inside a capture cost different amounts, use `pricing` or `costResolver` to price each call, or `setLlmCost()` for one specific span.
</Warning>

```typescript
// 3 LLM calls inside one capture, each with cost { input: 0.002, output: 0.004 }
await capture(
  "research-agent",
  async () => {
    const plan = await openai.chat.completions.create({ ... })   // span cost: total $0.006
    const answer = await openai.chat.completions.create({ ... }) // span cost: total $0.006
    const review = await openai.chat.completions.create({ ... }) // span cost: total $0.006
    // Trace total: 3 × $0.006 = $0.018. The capture's own wrapper span gets no cost.
  },
  { cost: { input: 0.002, output: 0.004 } },
)
```

The capture's own wrapper span never gets a cost. Nested captures inherit the cost unless they set their own. Cost does not travel through `injectTraceContext()` carriers, so set it on each side.

`setLlmCost()` writes onto a live span, typically one you created yourself:

```ts
const span = tracer.startSpan("my-llm-call", {
  attributes: { "gen_ai.operation.name": "chat", "gen_ai.request.model": "my-model" },
})
setLlmCost(span, { input: 0.01, output: 0.03 })
span.end()
```

### What the SDK reads and writes

The SDK only prices LLM-call spans: spans whose `gen_ai.operation.name` is `chat`, `text_completion`, `generate_content`, `embeddings` or `rerank`/`reranker`, or the equivalent OpenInference (`openinference.span.kind` `LLM`/`EMBEDDING`/`RERANKER`), OpenLLMetry (`llm.request.type`) or Vercel AI SDK leaf (`ai.*.doGenerate`/`doStream`/`doEmbed`) spans, plus CrewAI's `AGENT` span, which carries its LLM usage. `setLlmCost()` must be called on one of those LLM-call spans: trace and session totals and the Cost page only count cost on usage operations. Calling it on any other span still sets the cost attributes, and the SDK logs a warning once per process.

For `costResolver` and `pricing` it reads the fields below. `costResolver` receives them as an `LlmUsage` with `provider`, `model`, `inputTokens`, `outputTokens`, `operation`, `spanName` and `attributes`; any of the first four can be `undefined`.

| Field | Attributes, first present wins |
| --- | --- |
| provider | `gen_ai.provider.name`, `gen_ai.model.provider`, `gen_ai.system`, `llm.system`, `llm.provider`, `ai.model.provider` (vendor part only, e.g. `openai.chat` → `openai`) |
| model | `gen_ai.response.model`, `gen_ai.request.model`, `llm.model_name`, `ai.model.id` |
| input tokens | `gen_ai.usage.input_tokens`, `gen_ai.usage.prompt_tokens`, `llm.token_count.prompt`, `ai.usage.promptTokens`, `ai.usage.inputTokens` |
| output tokens | `gen_ai.usage.output_tokens`, `gen_ai.usage.completion_tokens`, `llm.token_count.completion`, `ai.usage.completionTokens`, `ai.usage.outputTokens` |

`pricing` tries the response model first, then the requested model. It needs a provider, a matching model and at least one token count, and treats a missing token count or rate as 0. Cache and reasoning tokens are not priced separately. Use `costResolver` if you need that; it also receives the span's raw `attributes`. If `costResolver` throws, the SDK logs a warning and falls back to `pricing`. Cost is resolved when each span ends, before redaction, so `costResolver` runs on your application's thread; keep it fast and side-effect free.

Where the SDK sets a cost it writes the standard `gen_ai.usage.input_cost`, `gen_ai.usage.output_cost` and `gen_ai.usage.total_cost` attributes plus `latitude.cost.source = "user"` (exported as `ATTRIBUTES.costInput`, `costOutput`, `costTotal`, `costSource` and `COST_SOURCE_USER`). It replaces any cost your instrumentation already wrote on that span, including a `total`-only cost removing the instrumentation's input and output costs so the numbers stay consistent. Spans the SDK doesn't price keep whatever cost the instrumentation wrote. The cost is written as the span is exported to Latitude, so other exporters on the same OpenTelemetry provider see the span unchanged.

## Redaction

Before exporting a span, Latitude masks the values of sensitive attributes with `******`. By default it masks these attributes, matched case-insensitively:

| Pattern | Matches |
| ------- | ------- |
| `/^http\.request\.header\.authorization$/i` | `http.request.header.authorization` |
| `/^http\.request\.header\.cookie$/i` | `http.request.header.cookie` |
| `/^http\.request\.header\.x[-_]api[-_]key$/i` | `http.request.header.x-api-key`, `http.request.header.x_api_key` |
| `/^db\.statement$/i` | `db.statement` |

To redact other attributes, pass `redact`. A string matches one attribute key exactly, and a regular expression matches any key it finds a match in. `mask` is optional: it receives the attribute key and value and returns the string to export instead.

```ts
import { DEFAULT_REDACT_PATTERNS, Latitude } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  redact: {
    attributes: [
      ...DEFAULT_REDACT_PATTERNS, // keep the defaults
      "app.customer.ssn",
      /^gen_ai\.(prompt|completion)\./,
    ],
    mask: (key, value) => "[redacted]",
  },
})
```

<Warning>
  A custom `redact` **replaces** the default patterns rather than adding to them. This is existing behaviour. To keep the defaults, include `...DEFAULT_REDACT_PATTERNS` in `attributes` as above. Pass `disableRedact: true` to turn redaction off entirely.
</Warning>

Redaction covers span attributes, event attributes and link attributes. It never throws into your code and never drops a span: if your `mask` throws or returns something that isn't a string, number or boolean, that value is exported as `******` instead.

Regular expressions never mask the attributes Latitude needs to tell which operation a span is and which provider and model served it, even a broad pattern such as `/^gen_ai\./` or `/.*/`:

| What | Attributes |
| ---- | ---------- |
| Operation | `gen_ai.operation.name`, `openinference.span.kind`, `llm.request.type`, `ai.operationId`, `latitude.span.kind`, `span.type` |
| Provider | `gen_ai.provider.name`, `gen_ai.system`, `gen_ai.model.provider`, `llm.system`, `llm.provider`, `ai.model.provider` |
| Model | `gen_ai.request.model`, `gen_ai.response.model`, `llm.model_name`, `embedding.model_name`, `reranker.model_name`, `ai.model.id`, `ai.response.model` |

Without them Latitude can't count the span in cost and usage, attribute it to a model, or price it. They name an operation, provider or model, never your data. If you still need to hide one, list its exact key as a string: exact-key patterns always apply. The exempt keys are exported as `REDACTION_EXEMPT_ATTRIBUTES`. Cost attributes the SDK sets itself (see [Bring your own cost](#bring-your-own-cost)) are written after redaction, so patterns never mask them either.

Redaction applies only to what Latitude exports. Latitude never modifies the span itself, so other span processors and exporters on the same tracer provider (see [Existing Sentry or OpenTelemetry setup](#existing-sentry-or-opentelemetry-setup)) still see the raw values. Configure redaction for those separately.

## Existing Sentry or OpenTelemetry setup

If your app already uses Sentry, Datadog, New Relic, Honeycomb, or another OpenTelemetry-compatible SDK, initialize that SDK first and construct `Latitude` second. Latitude will attach its span processor to the existing provider when possible.

```ts
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import { Latitude } from "@latitude-data/telemetry"
import * as Sentry from "@sentry/node"
import OpenAI from "openai"

Sentry.init({
  dsn: process.env.SENTRY_DSN!,
  tracesSampleRate: 1.0,
})

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})
```

If Sentry's automatic OpenTelemetry setup conflicts with Latitude tracing, setting `skipOpenTelemetrySetup: true` in `Sentry.init()` can help by preventing Sentry from configuring OpenTelemetry itself. This disables Sentry's automatic tracing and span emission; error reporting remains available, but sending traces to Sentry requires manually wiring Sentry's OpenTelemetry components.

`latitude.shutdown()` only shuts down Latitude-owned processing. It does not shut down your existing observability SDK.

If you need lower-level OpenTelemetry wiring or a non-TypeScript runtime, see the [OpenTelemetry Exporter](/telemetry/otel-exporter) guide.

## Supported integrations

Import each factory from its opt-in subpath under `@latitude-data/telemetry/instrumentations/` and pass the SDK module your app imports.

| Integration | Subpath | Factory | LLM SDK |
| --- | --- | --- | --- |
| OpenAI (and Azure OpenAI) | `openai` | `createOpenAIInstrumentation` | `openai` |
| OpenAI Agents SDK | `openai-agents` | `createOpenAIAgentsInstrumentation` | `@openai/agents` |
| Anthropic | `anthropic` | `createAnthropicInstrumentation` | `@anthropic-ai/sdk` |
| Amazon Bedrock | `bedrock` | `createBedrockInstrumentation` | `@aws-sdk/client-bedrock-runtime` |
| Cohere | `cohere` | `createCohereInstrumentation` | `cohere-ai` |
| LangChain | `langchain` | `createLangChainInstrumentation` | `@langchain/core` (pass the `@langchain/core/callbacks/manager` module) |
| LlamaIndex | `llamaindex` | `createLlamaIndexInstrumentation` | `llamaindex` |
| Together AI | `togetherai` | `createTogetherAIInstrumentation` | `together-ai` |
| Vertex AI | `vertexai` | `createVertexAIInstrumentation` | `@google-cloud/vertexai` |
| Google AI Platform | `aiplatform` | `createAIPlatformInstrumentation` | `@google-cloud/aiplatform` |

Frameworks that run their own OpenTelemetry (Vercel AI SDK, Cloudflare Think, Flue, LiveKit, Mastra, Eve) and providers without a TypeScript factory are covered by their own pages in the Getting Started sidebar, or by the [OpenTelemetry exporter](/telemetry/otel-exporter).

## Troubleshooting

### Spans are not appearing in Latitude

Start with the most common setup issues.

#### Check the API key and project slug

Make sure both values are present in the runtime where your app is executing:

```ts
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})
```

If either value is missing or points to the wrong organization/project, Latitude cannot route the spans to your project.

#### Pass the same SDK module your app uses

The module passed to `instrumentations` should be the same package import used for the actual LLM call.

```ts
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import { Latitude } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready
const client = new OpenAI()

await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
})
```

Avoid importing one SDK module for instrumentation and using a different wrapper or separately loaded copy for the LLM call.

#### Flush before short-lived processes exit

Servers can usually export spans in the background. Scripts, CLIs, tests, and jobs that exit immediately should flush before shutdown:

```ts
try {
  await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  })

  await latitude.flush()
} finally {
  await latitude.shutdown()
}
```

#### Wrap the actual LLM call with `capture()`

If you use `capture()`, the instrumented operation must happen inside the callback:

```ts
await capture(
  "support-agent-turn",
  async () => {
    return client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
    })
  },
  {
    userId: user.id,
    sessionId: conversation.id,
    project: "support-agent",
  },
)
```

This will not attach context to the LLM call, because the call happens before `capture()` starts:

```ts
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: userMessage }],
})

await capture("support-agent-turn", async () => response, {
  userId: user.id,
  sessionId: conversation.id,
})
```

#### Consume streaming responses inside `capture()`

For streaming responses, create and consume the stream inside the `capture()` callback. This keeps the full streamed operation inside the active OpenTelemetry context.

```ts
await capture(
  "stream-support-agent-turn",
  async () => {
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        process.stdout.write(content)
      }
    }
  },
  {
    userId: user.id,
    sessionId: conversation.id,
    project: "support-agent",
  },
)
```

Avoid returning the stream from `capture()` and consuming it later. Once the callback has finished, the Latitude context is no longer active for the remaining stream consumption.

### No spans are created inside `capture()`

`capture()` only attaches context. You still need a supported instrumentation, and the code inside the callback must make an instrumented LLM call.

### Context is not propagating

`new Latitude()` registers the OpenTelemetry context manager automatically. If you provide your own OpenTelemetry setup, make sure it has a working context manager before Latitude attaches to it.
