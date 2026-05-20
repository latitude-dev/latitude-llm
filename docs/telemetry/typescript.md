---
title: TypeScript SDK
description: Instrument TypeScript and JavaScript apps with Latitude Telemetry.
---

# TypeScript SDK

Use `@latitude-data/telemetry` to send LLM traces from TypeScript and JavaScript applications to Latitude. The SDK is built on OpenTelemetry and can attach to an existing tracing setup when your app already uses one.

## Installation

```bash
npm install @latitude-data/telemetry
```

## Bootstrap

Initialize Latitude once, before your LLM calls run. Pass the LLM SDK modules your app uses through `instrumentations` so Latitude can auto-instrument them.

```ts
import { Latitude } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

const client = new OpenAI()

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
})

await latitude.shutdown()
```

`new Latitude()` starts instrumentation in the background and returns immediately. You can start using your LLM clients right away.

## Add context with `capture()`

Auto-instrumentation creates spans for supported LLM calls. Use `capture()` to attach Latitude context to the spans created inside a request, conversation turn, or agent run.

You can use `capture()` to:

- group traces by **user**
- group traces into a **session**
- route traces to a specific **project**
- add tags and metadata for filtering
- mark the boundary of an agent run

```ts
import { Latitude, capture } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

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

Nested `capture()` calls inherit parent context and can override local values. Metadata is shallow-merged, and tags are appended and deduplicated.

## Existing Sentry or OpenTelemetry setup

If your app already uses Sentry, Datadog, New Relic, Honeycomb, or another OpenTelemetry-compatible SDK, initialize that SDK first and construct `Latitude` second. Latitude will attach its span processor to the existing provider when possible.

```ts
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
  instrumentations: { openai: OpenAI },
})
```

`latitude.shutdown()` only shuts down Latitude-owned processing. It does not shut down your existing observability SDK.

If you need lower-level OpenTelemetry wiring or a non-TypeScript runtime, see the [OpenTelemetry Exporter](/telemetry/otel-exporter) guide.

## Supported integrations

Set the integration key on `instrumentations` to the SDK module your app imports.

| Integration | Package | Example |
| --- | --- | --- |
| OpenAI | `openai` | `{ openai: OpenAI }` |
| OpenAI Agents SDK | `@openai/agents` | `{ "openai-agents": OpenAIAgentsSDK }` |
| Anthropic | `@anthropic-ai/sdk` | `{ anthropic: AnthropicSDK }` |
| Amazon Bedrock | `@aws-sdk/client-bedrock-runtime` | `{ bedrock: BedrockSDK }` |
| Cohere | `cohere-ai` | `{ cohere: CohereSDK }` |
| LangChain | `langchain` | `{ langchain: LangChain }` |
| LlamaIndex | `llamaindex` | `{ llamaindex: LlamaIndex }` |
| Together AI | `together-ai` | `{ togetherai: TogetherSDK }` |
| Vertex AI | `@google-cloud/vertexai` | `{ vertexai: VertexAISDK }` |
| Google AI Platform | `@google-cloud/aiplatform` | `{ aiplatform: AIPlatformSDK }` |

For provider-specific setup notes, use the provider and framework pages in the Observability sidebar.

## Troubleshooting

### Spans are not appearing in Latitude

Start with the most common setup issues.

#### Check the API key and project slug

Make sure both values are present in the runtime where your app is executing:

```ts
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})
```

If either value is missing or points to the wrong organization/project, Latitude cannot route the spans to your project.

#### Pass the same SDK module your app uses

The module passed to `instrumentations` should be the same package import used for the actual LLM call.

```ts
import { Latitude } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

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

### First request is missing after startup

`await latitude.ready` is optional. Most applications do not need it.

Use it only during startup if your app makes an LLM call immediately after constructing `Latitude` and that first call is missing from Latitude:

```ts
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

await latitude.ready
```

After instrumentation is registered, you do not need to await `ready` around individual requests.

### No spans are created inside `capture()`

`capture()` only attaches context. You still need a supported instrumentation, and the code inside the callback must make an instrumented LLM call.

### Context is not propagating

`new Latitude()` registers the OpenTelemetry context manager automatically. If you provide your own OpenTelemetry setup, make sure it has a working context manager before Latitude attaches to it.
