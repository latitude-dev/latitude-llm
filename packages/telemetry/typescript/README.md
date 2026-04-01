# Latitude Telemetry for TypeScript

Instrument your AI application and send traces to [Latitude](https://latitude.so). Built on [OpenTelemetry](https://opentelemetry.io/).

## Installation

```sh
npm install @latitude-data/telemetry
```

## Quick Start

```typescript
import OpenAI from "openai"
import { LatitudeTelemetry, Instrumentation } from "@latitude-data/telemetry"

const telemetry = new LatitudeTelemetry("your-api-key", "your-project-slug", {
  instrumentations: {
    [Instrumentation.OpenAI]: OpenAI,
  },
})

// All OpenAI calls are now automatically traced
const client = new OpenAI()
const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
})

// Ensure traces are sent before process exits
await telemetry.flush()
```

## Constructor

```typescript
new LatitudeTelemetry(apiKey: string, projectSlug: string, options?: TelemetryOptions)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | `string` | Your Latitude API key |
| `projectSlug` | `string` | Your Latitude project slug |
| `options` | `TelemetryOptions` | Optional configuration |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | `process.env.npm_package_name` | Service name reported in traces |
| `disableBatch` | `boolean` | `false` | Send spans immediately instead of batching |
| `exporter` | `SpanExporter` | OTLP to Latitude | Custom span exporter |
| `processors` | `SpanProcessor[]` | Redact processor | Custom span processors |
| `propagators` | `TextMapPropagator[]` | W3C Trace + Baggage | Custom context propagators |
| `instrumentations` | `object` | `{}` | Provider modules to auto-instrument |

## Auto-Instrumentation

Pass the provider module to automatically instrument all calls:

```typescript
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"
import { LatitudeTelemetry, Instrumentation } from "@latitude-data/telemetry"

const telemetry = new LatitudeTelemetry("your-api-key", "your-project-slug", {
  instrumentations: {
    [Instrumentation.OpenAI]: OpenAI,
    [Instrumentation.Anthropic]: Anthropic,
  },
})
```

### Supported Providers

| Instrumentation | Package |
|-----------------|---------|
| `Instrumentation.OpenAI` | `openai` |
| `Instrumentation.Anthropic` | `@anthropic-ai/sdk` |
| `Instrumentation.Bedrock` | `@aws-sdk/client-bedrock-runtime` |
| `Instrumentation.Cohere` | `cohere-ai` |
| `Instrumentation.Langchain` | `langchain` |
| `Instrumentation.LlamaIndex` | `llamaindex` |
| `Instrumentation.TogetherAI` | `together-ai` |
| `Instrumentation.VertexAI` | `@google-cloud/vertexai` |
| `Instrumentation.AIPlatform` | `@google-cloud/aiplatform` |

## Capture

Use `capture()` to set trace-wide context attributes. All spans created within the callback inherit these as baggage:

```typescript
await telemetry.capture(
  {
    tags: ["production", "chat"],
    metadata: { environment: "prod", version: "1.2.0" },
    sessionId: "session-abc-123",
    userId: "user-456",
  },
  async (ctx) => {
    // All spans created here will carry the tags, metadata, sessionId, userId
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello!" }],
    })
    return response
  },
)
```

### Capture Options

| Option | Type | OTel Attribute | Description |
|--------|------|----------------|-------------|
| `tags` | `string[]` | `latitude.tags` | Tags for filtering traces |
| `metadata` | `Record<string, unknown>` | `latitude.metadata` | Arbitrary key-value metadata |
| `sessionId` | `string` | `session.id` | Group traces by session |
| `userId` | `string` | `user.id` | Associate traces with a user |

## Custom Spans

The SDK exposes the underlying OpenTelemetry `tracer` for creating custom spans:

```typescript
// Simple span
const span = telemetry.tracer.startSpan("my-operation")
span.setAttribute("custom.key", "value")
span.end()

// Nested spans with context
telemetry.context.with(
  telemetry.tracer.startSpan("parent").context,
  () => {
    const child = telemetry.tracer.startSpan("child")
    child.end()
  },
)
```

## Context Management

```typescript
// Get the current active context
const ctx = telemetry.context.active()

// Run code within a specific context
telemetry.context.with(ctx, () => {
  // spans created here are children of ctx
})

// Resume a trace from W3C traceparent
const ctx = telemetry.context.resume({
  traceparent: "00-trace-id-span-id-01",
  baggage: "key=value",
})
```

## Lifecycle

```typescript
// Force flush pending spans
await telemetry.flush()

// Shutdown (flushes then closes)
await telemetry.shutdown()
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002` (dev) / `https://ingest.latitude.so` (prod) | OTLP exporter endpoint |

## License

MIT
