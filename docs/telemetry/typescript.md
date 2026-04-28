---
title: TypeScript SDK
description: Full API reference for @latitude-data/telemetry, the TypeScript SDK for Latitude Telemetry.
---

# TypeScript SDK

Instrument your AI application and send traces to Latitude. Built on OpenTelemetry.

## Installation

```bash
npm install @latitude-data/telemetry
```

## Bootstrap (Recommended)

The fastest way to start. One function sets up a complete OpenTelemetry pipeline with LLM auto-instrumentation and the Latitude exporter:

```ts
import { initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})

await latitude.ready

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
})

await latitude.shutdown()
```

`initLatitude` returns **immediately**. Instrumentation registration happens in the background. This avoids top-level await issues in CommonJS environments while still supporting ESM.

- **Fire-and-forget**: Start using your LLM clients right away. Early spans are captured once instrumentations finish registering.
- **Optional `await latitude.ready`**: If you need instrumentations fully registered before making LLM calls, await the `ready` promise.

## Using `capture()` for Context

Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` when you want to:

- **Group traces by user or session**: Track all LLM calls from a specific user
- **Add business context**: Tag traces with environment, feature flags, or request IDs
- **Mark agent boundaries**: Wrap an agent run or conversation turn with a name and metadata
- **Filter and analyze**: Use tags and metadata to filter traces in Latitude

```ts
import { initLatitude, capture } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})

await latitude.ready

await capture(
  "handle-user-request",
  async () => {
    const result = await agent.process(userMessage)
    return result
  },
  {
    userId: "user_123",
    sessionId: "session_abc",
    tags: ["production", "v2-agent"],
    metadata: { requestId: "req-xyz", featureFlag: "new-prompt" },
  },
)

await latitude.shutdown()
```

`capture()` does **not** create spans. It only attaches context to spans created by auto-instrumentation. Use one `capture()` call at the request or agent boundary. Nested calls inherit from the parent context with local overrides.

**Nesting behavior:**

| Field | Behavior |
|---|---|
| `userId` | Last-write-wins |
| `sessionId` | Last-write-wins |
| `metadata` | Shallow merge |
| `tags` | Append and dedupe, preserving order |

## Existing OpenTelemetry Setup (Advanced)

If your app already uses OpenTelemetry, add Latitude alongside your existing processors:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node"
import {
  LatitudeSpanProcessor,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry"

const sdk = new NodeSDK({
  spanProcessors: [
    existingProcessor,
    new LatitudeSpanProcessor(
      process.env.LATITUDE_API_KEY!,
      process.env.LATITUDE_PROJECT_SLUG!,
    ),
  ],
})

sdk.start()

await registerLatitudeInstrumentations({
  instrumentations: ["openai"],
  tracerProvider: sdk.getTracerProvider(),
})
```

For examples of integrating with **Datadog**, **Sentry**, or other observability platforms, see the [OpenTelemetry Exporter](otel-exporter) guide. That guide also covers connecting from **any language** beyond TypeScript and Python.

## Public API Reference

```ts
import {
  initLatitude,
  LatitudeSpanProcessor,
  capture,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry"
```

### `initLatitude(options)`

Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export.

```ts
type InitLatitudeOptions = {
  apiKey: string
  projectSlug: string
  instrumentations?: InstrumentationType[]
  serviceName?: string
  disableBatch?: boolean
  disableSmartFilter?: boolean
  shouldExportSpan?: (span: ReadableSpan) => boolean
  blockedInstrumentationScopes?: string[]
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  exporter?: SpanExporter
}

function initLatitude(options: InitLatitudeOptions): {
  provider: NodeTracerProvider
  ready: Promise<void>
  flush(): Promise<void>
  shutdown(): Promise<void>
}
```

### `capture(name, fn, options?)`

Wraps a function to attach Latitude context to all spans created inside. Uses OpenTelemetry's native `context.with()` for scoping.

```ts
type ContextOptions = {
  name?: string
  userId?: string
  sessionId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

function capture<T>(
  name: string,
  fn: () => T | Promise<T>,
  options?: ContextOptions,
): T | Promise<T>
```

| Option | Type | OTel Attribute | Description |
|---|---|---|---|
| `name` | `string` | `latitude.capture.name` | Name for the capture context |
| `tags` | `string[]` | `latitude.tags` | Tags for filtering traces |
| `metadata` | `Record<string, unknown>` | `latitude.metadata` | Arbitrary key-value metadata |
| `sessionId` | `string` | `session.id` | Group traces by session |
| `userId` | `string` | `user.id` | Associate traces with a user |

### `LatitudeSpanProcessor`

Span processor for shared-provider setups. Reads Latitude context from OTel context and stamps attributes onto spans.

```ts
class LatitudeSpanProcessor implements SpanProcessor {
  constructor(
    apiKey: string,
    projectSlug: string,
    options?: LatitudeSpanProcessorOptions,
  )
}

type LatitudeSpanProcessorOptions = {
  disableBatch?: boolean
  disableSmartFilter?: boolean
  shouldExportSpan?: (span: ReadableSpan) => boolean
  blockedInstrumentationScopes?: string[]
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  exporter?: SpanExporter
}
```

### `registerLatitudeInstrumentations(options)`

Registers patch-based AI SDK instrumentations against a specific tracer provider.

```ts
type InstrumentationType =
  | "openai"
  | "anthropic"
  | "bedrock"
  | "cohere"
  | "langchain"
  | "llamaindex"
  | "togetherai"
  | "vertexai"
  | "aiplatform"

function registerLatitudeInstrumentations(options: {
  instrumentations: InstrumentationType[]
  tracerProvider: TracerProvider
  modules?: Partial<Record<InstrumentationType, unknown>>
  enrichTokens?: Partial<Record<InstrumentationType, boolean>>
}): Promise<void>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `modules` | `Partial<Record<InstrumentationType, unknown>>` | Auto-required | Explicit module references for instrumentations that can't be auto-required |
| `enrichTokens` | `Partial<Record<InstrumentationType, boolean>>` | `{ openai: true, togetherai: false }` | Enable or disable token usage enrichment per instrumentation |

## Supported Providers

| Identifier | Package |
|---|---|
| `"openai"` | `openai` |
| `"anthropic"` | `@anthropic-ai/sdk` |
| `"bedrock"` | `@aws-sdk/client-bedrock-runtime` |
| `"cohere"` | `cohere-ai` |
| `"langchain"` | `langchain` |
| `"llamaindex"` | `llamaindex` |
| `"togetherai"` | `together-ai` |
| `"vertexai"` | `@google-cloud/vertexai` |
| `"aiplatform"` | `@google-cloud/aiplatform` |

## Configuration

### Smart Filtering

By default, only LLM-relevant spans are exported (spans with `gen_ai.*`, `llm.*`, `openinference.*`, or `ai.*` attributes, plus known LLM instrumentation scopes):

```ts
new LatitudeSpanProcessor(apiKey, projectSlug, {
  disableSmartFilter: true, // Export all spans
})
```

### Redaction

PII redaction is enabled by default for security-sensitive attributes:

- HTTP authorization headers
- HTTP cookies
- HTTP API key headers (`x-api-key`)
- Database statements

```ts
new LatitudeSpanProcessor(apiKey, projectSlug, {
  disableRedact: true, // Disable all redaction
  redact: {
    attributes: [/^password$/i, /secret/i], // Add custom patterns
    mask: (attr, value) => "[REDACTED]",
  },
})
```

### Custom Filtering

```ts
new LatitudeSpanProcessor(apiKey, projectSlug, {
  shouldExportSpan: (span) => span.attributes["custom"] === true,
  blockedInstrumentationScopes: ["opentelemetry.instrumentation.fs"],
})
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002` (dev) / `https://ingest.latitude.so` (prod) | OTLP exporter endpoint |

## Troubleshooting

### Spans not appearing in Latitude

1. **Check API key and project slug**: Must be non-empty strings.
2. **Verify instrumentations are registered**: Use `await latitude.ready` or `await registerLatitudeInstrumentations()`.
3. **Flush before exit**: Call `await latitude.flush()` or `await provider.forceFlush()`.
4. **Check smart filter**: Only LLM spans are exported by default. Use `disableSmartFilter: true` to export all spans.
5. **Ensure `capture()` wraps the code that creates spans**: `capture()` itself doesn't create spans; it only attaches context.

### No spans created inside `capture()`

`capture()` only attaches context. You need:

1. An active instrumentation (e.g., OpenAI auto-instrumentation).
2. That instrumentation to create spans for the operations inside your callback.

### Context not propagating

Ensure you have a functioning OpenTelemetry context manager registered:

```ts
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { context } from "@opentelemetry/api"

context.setGlobalContextManager(new AsyncLocalStorageContextManager())
```

`initLatitude()` does this automatically. For shared-provider setups, your existing OTel setup should already have this.
