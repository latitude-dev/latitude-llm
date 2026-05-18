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

The fastest way to start. One class detects an existing OpenTelemetry pipeline (Sentry, Datadog, New Relic, Honeycomb, etc.) or creates one when none exists, then adds LLM auto-instrumentation and the Latitude exporter:

```ts
import OpenAI from "openai"
import { Latitude } from "@latitude-data/telemetry"

const client = new OpenAI()

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

await latitude.ready

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
})

await latitude.shutdown()
```

`instrumentations` takes a plain object mapping integration name (`openai`, `anthropic`, …) to the LLM SDK module the consumer imports in app code. The same module instance is used for both the patch and the actual LLM call, sidestepping the CJS/ESM dual-load class of bugs.

`new Latitude()` returns **immediately**. Instrumentation registration happens in the background. This avoids top-level await issues in CommonJS environments while still supporting ESM.

- **Fire-and-forget**: Start using your LLM clients right away. Early spans are captured once instrumentations finish registering.
- **Optional `await latitude.ready`**: If you need instrumentations fully registered before making LLM calls, await the `ready` promise.
- **Existing tracing SDKs**: Initialize Sentry or another tracing SDK first, then construct `new Latitude()`. Latitude attaches its span processor to the existing provider when possible. `latitude.shutdown()` only shuts down Latitude-owned processing and does not shut down the other SDK.

## Using `capture()` for Context

Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` when you want to:

- **Group traces by user or session**: Track all LLM calls from a specific user
- **Add business context**: Tag traces with environment, feature flags, or request IDs
- **Mark agent boundaries**: Wrap an agent run or conversation turn with a name and metadata
- **Filter and analyze**: Use tags and metadata to filter traces in Latitude

```ts
import OpenAI from "openai"
import { Latitude, capture } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
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

## Existing Sentry or OpenTelemetry Setup

For Sentry, Datadog, New Relic, Honeycomb, and other OpenTelemetry-compatible SDKs, initialize the existing SDK first and construct `new Latitude()` second. Latitude detects the installed provider and attaches its processor when possible without replacing the existing SDK's context manager, propagator, sampler, or processors:

```ts
import OpenAI from "openai"
import * as Sentry from "@sentry/node"
import { Latitude } from "@latitude-data/telemetry"

Sentry.init({
  dsn: process.env.SENTRY_DSN!,
  tracesSampleRate: 1.0,
})

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
})

await latitude.ready

// LLM spans are exported to both Sentry and Latitude.
await latitude.flush()
await latitude.shutdown()
```

If you want full control over provider construction, add Latitude alongside your existing processors explicitly:

```ts
import OpenAI from "openai"
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
  instrumentations: { openai: OpenAI },
  tracerProvider: sdk.getTracerProvider(),
})
```

For examples of integrating with **Datadog**, **Sentry**, **New Relic**, **Honeycomb**, or other observability platforms, see the [OpenTelemetry Exporter](otel-exporter) guide. That guide also covers connecting from **any language** beyond TypeScript and Python.

## Public API Reference

```ts
import {
  Latitude,
  LatitudeSpanProcessor,
  capture,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry"
```

### `new Latitude(options)`

Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export.

```ts
type LatitudeOptions = {
  apiKey: string
  // Default project for spans emitted by this SDK instance. Optional — every
  // `capture()` can override. Sent as the `X-Latitude-Project` header on each export.
  project?: string
  // DEPRECATED alias for `project`. Still accepted; logs a one-time warning.
  projectSlug?: string
  // Map of integration name → LLM SDK module reference (e.g. { openai: OpenAI }).
  // Anything else (string array, primitive, unknown key, non-object) throws at register time.
  instrumentations?: InstrumentationsInput
  serviceName?: string
  disableBatch?: boolean
  disableSmartFilter?: boolean
  shouldExportSpan?: (span: ReadableSpan) => boolean
  blockedInstrumentationScopes?: string[]
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  exporter?: SpanExporter
  tracerProvider?: TracerProvider
}

class Latitude {
  constructor(options: LatitudeOptions)
  provider: TracerProvider
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
  // Route this capture (and its child spans) to a specific Latitude project,
  // overriding the constructor's `project` default for the duration of the capture.
  project?: string
  // DEPRECATED alias for `project`. Still accepted; logs a one-time warning.
  projectSlug?: string
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
    project: string | undefined,
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
type InstrumentationName =
  | "openai"
  | "openai-agents"
  | "anthropic"
  | "bedrock"
  | "cohere"
  | "langchain"
  | "llamaindex"
  | "togetherai"
  | "vertexai"
  | "aiplatform"

// `object | undefined` rejects primitive values (`true`, `42`, `"openai"`, …)
// at compile time while still admitting class constructors (functions),
// namespace imports, and explicit-undefined-for-conditional-config.
type InstrumentationsInput = Partial<Record<InstrumentationName, object | undefined>>

function registerLatitudeInstrumentations(options: {
  // Map of integration name → LLM SDK module reference (e.g. { openai: OpenAI }).
  // Anything else throws at register time.
  instrumentations: InstrumentationsInput
  tracerProvider: TracerProvider
}): Promise<void>
```

## Supported Providers

Set the integration's key on the `instrumentations` object to the LLM SDK module the consumer imports. For SDKs whose Traceloop patch reads off the package namespace, pass `import * as X from "<package>"`.

| Key | Package | What to pass |
|---|---|---|
| `openai` | `openai` | `openai: OpenAI` (default class — also accepts the namespace) |
| `openai-agents` | `@openai/agents` | `"openai-agents": OpenAIAgentsSDK` (namespace) |
| `anthropic` | `@anthropic-ai/sdk` | `anthropic: AnthropicSDK` (namespace; bare default class also accepted and rewrapped) |
| `bedrock` | `@aws-sdk/client-bedrock-runtime` | `bedrock: BedrockSDK` (namespace) |
| `cohere` | `cohere-ai` | `cohere: CohereSDK` (namespace) |
| `langchain` | `langchain` | `langchain: LangChain` (namespace) |
| `llamaindex` | `llamaindex` | `llamaindex: LlamaIndex` (namespace) |
| `togetherai` | `together-ai` | `togetherai: TogetherSDK` (namespace) |
| `vertexai` | `@google-cloud/vertexai` | `vertexai: VertexAISDK` (namespace) |
| `aiplatform` | `@google-cloud/aiplatform` | `aiplatform: AIPlatformSDK` (namespace) |

## Migrating from `instrumentations: ["openai"]` (3.0.0-alpha.10 and earlier)

The string-array form is removed with no fallback in `3.0.0-alpha.11`. Anything other than a plain object — including the old string array — **throws at register time**, so any existing install below `alpha.11` must be bumped *and* its call sites rewritten in the same change. Migration:

```diff
- import { Latitude } from "@latitude-data/telemetry"
+ import OpenAI from "openai"
+ import * as AnthropicSDK from "@anthropic-ai/sdk"
+ import { Latitude } from "@latitude-data/telemetry"

  new Latitude({
    apiKey: process.env.LATITUDE_API_KEY!,
    project: process.env.LATITUDE_PROJECT_SLUG!,
-   instrumentations: ["openai", "anthropic"],
+   instrumentations: { openai: OpenAI, anthropic: AnthropicSDK },
  })
```

The `modules` option on `registerLatitudeInstrumentations` is also removed — pass the SDK module under its integration key on `instrumentations` instead.

## Configuration

### Smart Filtering

By default, only LLM-relevant spans are exported (spans with `gen_ai.*`, `llm.*`, `openinference.*`, or `ai.*` attributes, plus known LLM instrumentation scopes):

```ts
new LatitudeSpanProcessor(apiKey, project, {
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
new LatitudeSpanProcessor(apiKey, project, {
  disableRedact: true, // Disable all redaction
  redact: {
    attributes: [/^password$/i, /secret/i], // Add custom patterns
    mask: (attr, value) => "[REDACTED]",
  },
})
```

### Custom Filtering

```ts
new LatitudeSpanProcessor(apiKey, project, {
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
3. **Did the bootstrap throw a migration error?**: On `3.0.0-alpha.11`+, `instrumentations: ["openai"]` (or any non-object value) throws `TypeError: [Latitude] instrumentations must be an object mapping…`. Migrate to `instrumentations: { openai: OpenAI }`. See the Migration section above.
4. **Flush before exit**: Call `await latitude.flush()` or `await provider.forceFlush()`.
5. **Check smart filter**: Only LLM spans are exported by default. Use `disableSmartFilter: true` to export all spans.
6. **Ensure `capture()` wraps the code that creates spans**: `capture()` itself doesn't create spans; it only attaches context.

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

`new Latitude()` does this automatically. For shared-provider setups, your existing OTel setup should already have this.
