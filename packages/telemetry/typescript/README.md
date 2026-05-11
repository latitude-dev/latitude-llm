# Latitude Telemetry for TypeScript

Instrument your AI application and send traces to [Latitude](https://latitude.so). Built on [OpenTelemetry](https://opentelemetry.io/).

## Installation

```sh
npm install @latitude-data/telemetry
```

## Quick Start

### Bootstrap (Recommended)

The fastest way to start tracing your LLM calls. One class sets up everything:

```typescript
import { Latitude } from "@latitude-data/telemetry";

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"], // Auto-instrument OpenAI, Anthropic, etc.
});

// Optionally wait for instrumentations to be ready
await latitude.ready;

// Your LLM calls will now be traced and sent to Latitude
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

await latitude.shutdown();
```

**What this does:**

- Detects an existing OpenTelemetry provider (Sentry, Datadog, New Relic, Honeycomb, etc.) and adds Latitude to it when possible
- Creates a complete OpenTelemetry setup when your app does not already have one
- Registers LLM auto-instrumentation (OpenAI, Anthropic, etc.) **asynchronously in the background**
- Configures the Latitude span processor and exporter
- Sets up async context propagation (for passing context through async operations) when Latitude owns the OTel setup

**Key point about async instrumentations:**

`new Latitude()` returns **immediately** — no top-level await needed. Instrumentation registration happens in the background. This avoids top-level await issues in CommonJS environments while still supporting ESM.

- **Fire-and-forget**: Start using your LLM clients right away. Early spans will be captured once instrumentations finish registering.
- **Optional `await latitude.ready`**: If you want to ensure instrumentations are fully registered before making LLM calls, await the `ready` promise.

**When to use this:** Most applications should start here. If you already initialize Sentry or another tracing SDK, initialize it first and construct `new Latitude()` second. Latitude will reuse the existing tracing pipeline when possible, and `latitude.shutdown()` only shuts down Latitude-owned processing.

**When you might need the advanced setup:**

- You need custom span processing, sampling, or filtering
- You want to wire span processors explicitly instead of letting `new Latitude()` detect your provider

### Existing Sentry or OpenTelemetry Setup

If your app already uses Sentry or another OpenTelemetry-compatible SDK, initialize that SDK first and then construct `new Latitude()`:

```typescript
import * as Sentry from "@sentry/node";
import { Latitude } from "@latitude-data/telemetry";

Sentry.init({
  dsn: process.env.SENTRY_DSN!,
  tracesSampleRate: 1.0,
});

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});

await latitude.ready;

// LLM spans are exported to both Sentry (via its provider) and Latitude.
await latitude.flush();
await latitude.shutdown(); // Does not shut down Sentry.
```

For fully custom OTel setups, you can also wire the Latitude processor explicitly:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  LatitudeSpanProcessor,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry";

const sdk = new NodeSDK({
  spanProcessors: [
    existingProcessor, // Your existing processor
    new LatitudeSpanProcessor(
      process.env.LATITUDE_API_KEY!,
      process.env.LATITUDE_PROJECT_SLUG!,
    ),
  ],
});

sdk.start();

// Enable LLM auto-instrumentation
await registerLatitudeInstrumentations({
  instrumentations: ["openai"],
  tracerProvider: sdk.getTracerProvider(),
});

// Your LLM calls will now be traced and sent to Latitude
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

### Why OpenTelemetry?

Latitude Telemetry is built entirely on OpenTelemetry standards. When you're ready to add other observability tools (Datadog, Sentry, Jaeger, etc.), you can use them alongside Latitude without conflicts:

- **Standard span processors** — `LatitudeSpanProcessor` works with any `NodeSDK` or `NodeTracerProvider`
- **Smart filtering** — Only LLM-relevant spans are exported to Latitude (spans with `gen_ai.*`, `llm.*`, `openinference.*`, or `ai.*` attributes, plus known LLM instrumentation scopes)
- **Compatible with existing instrumentations** — Works alongside HTTP, DB, and other OTel instrumentations
- **No vendor lock-in** — Standard OTLP export, no proprietary wire format

## Using `capture()` for Context and Boundaries

The SDK automatically traces LLM calls when you use auto-instrumentation. However, you may want to add additional context (user ID, session ID, tags, or metadata) to group related spans together.

### What `capture()` Does

`capture()` wraps your code to attach Latitude context to all LLM spans created inside the callback:

- Adds attributes like `user.id`, `session.id`, `latitude.tags`, and `latitude.metadata` to every span
- Creates a named boundary for grouping related traces
- Uses OpenTelemetry's native `context.with()` for reliable async propagation

### When to Use It

You don't need `capture()` to get started—auto-instrumentation handles LLM calls automatically. Use `capture()` when you want to:

- **Group traces by user or session** — Track all LLM calls from a specific user or session
- **Add business context** — Tag traces with deployment environment, feature flags, or request IDs
- **Mark agent boundaries** — Wrap an entire agent run or conversation turn with a name and metadata
- **Filter and analyze** — Use tags and metadata to filter traces in the Latitude

### Example

```typescript
import { Latitude, capture } from "@latitude-data/telemetry";

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});

// Optional: wait for instrumentations before starting
await latitude.ready;

// Wrap a request or agent run to add context
await capture(
  "handle-user-request",
  async () => {
    const result = await agent.process(userMessage);
    return result;
  },
  {
    userId: "user_123",
    sessionId: "session_abc",
    tags: ["production", "v2-agent"],
    metadata: { requestId: "req-xyz", featureFlag: "new-prompt" },
  },
);

await latitude.shutdown();
```

**Important:** `capture()` does not create spans—it only attaches context to spans created by auto-instrumentation. Use one `capture()` call at the request or agent boundary. You can nest calls for granular context; child spans inherit from parent context with local overrides.

## Key Concepts

- **`new Latitude()`** — The primary way to use Latitude. Bootstraps a complete OpenTelemetry setup with LLM auto-instrumentation and the Latitude exporter. Best for most applications.
- **`LatitudeSpanProcessor`** — For advanced use cases where you already have an OpenTelemetry setup. Exports spans to Latitude alongside your existing observability stack.
- **`registerLatitudeInstrumentations()`** — Registers LLM auto-instrumentations (OpenAI, Anthropic, etc.) when using the advanced setup with your own provider.
- **`capture()`** — Optional. Wraps your code to attach Latitude context (tags, userId, sessionId, metadata) to all spans created inside the callback. Use this when you want to group traces by user, session, or add business context.

**Important:** Auto-instrumentation traces LLM calls without `capture()`. Use `capture()` only when you need to add context or mark boundaries. Wrap the request, job, or agent entrypoint once—you don't need to wrap every internal step.

## Public API

```typescript
import {
  Latitude,
  LatitudeSpanProcessor,
  capture,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry";
```

### `new Latitude(options)`

The primary entry point. Bootstraps a complete OpenTelemetry setup with LLM instrumentations and Latitude export.

```typescript
type LatitudeOptions = {
  apiKey: string;
  projectSlug: string;
  instrumentations?: InstrumentationType[]; // ["openai", "anthropic", etc.]
  serviceName?: string;
  disableBatch?: boolean;
  disableSmartFilter?: boolean;
  shouldExportSpan?: (span: ReadableSpan) => boolean;
  blockedInstrumentationScopes?: string[];
  disableRedact?: boolean;
  redact?: RedactSpanProcessorOptions;
  exporter?: SpanExporter;
  tracerProvider?: TracerProvider; // Optional explicit provider for Sentry/Datadog/New Relic/Honeycomb/custom OTel
};

class Latitude {
  constructor(options: LatitudeOptions);
  provider: TracerProvider; // Existing provider when detected, otherwise Latitude's NodeTracerProvider
  ready: Promise<void>; // Resolves when instrumentations are registered
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### `LatitudeSpanProcessor`

Span processor for shared-provider setups. Reads Latitude context from OTel context and stamps attributes onto spans.

```typescript
class LatitudeSpanProcessor implements SpanProcessor {
  constructor(
    apiKey: string,
    projectSlug: string,
    options?: LatitudeSpanProcessorOptions,
  );
}

type LatitudeSpanProcessorOptions = {
  disableBatch?: boolean;
  disableSmartFilter?: boolean;
  shouldExportSpan?: (span: ReadableSpan) => boolean;
  blockedInstrumentationScopes?: string[];
  disableRedact?: boolean;
  redact?: RedactSpanProcessorOptions;
  exporter?: SpanExporter;
};
```

### `capture(name, fn, options?)`

Wraps a function to attach Latitude context to all spans created inside. Uses OpenTelemetry's native `context.with()` for scoping.

```typescript
type ContextOptions = {
  name?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

function capture<T>(
  name: string,
  fn: () => T | Promise<T>,
  options?: ContextOptions,
): T | Promise<T>;
```

**Nested `capture()` behavior:**

- `userId`: last-write-wins
- `sessionId`: last-write-wins
- `metadata`: shallow merge
- `tags`: append and dedupe while preserving order

### `registerLatitudeInstrumentations(options)`

Registers patch-based AI SDK instrumentations against a specific tracer provider.

```typescript
type InstrumentationType =
  | "openai"
  | "openai-agents"
  | "anthropic"
  | "bedrock"
  | "cohere"
  | "langchain"
  | "llamaindex"
  | "togetherai"
  | "vertexai"
  | "aiplatform";

function registerLatitudeInstrumentations(options: {
  instrumentations: InstrumentationType[];
  tracerProvider: TracerProvider;
  instrumentationModules?: Partial<Record<InstrumentationType, unknown>>;
}): Promise<void>;
```

## Vendor-Specific Integration Guides

For users with existing observability infrastructure.

### With Datadog

Initialize Datadog first, then construct `new Latitude()` so Latitude can attach to Datadog's OTel provider when possible:

```typescript
import tracer from "dd-trace";
import { Latitude } from "@latitude-data/telemetry";

tracer.init({ service: "my-app", env: "production" });

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});

await latitude.ready;

// LLM calls are now traced and sent to both Datadog and Latitude.
await latitude.flush();
await latitude.shutdown(); // Does not shut down Datadog.
```

**Adding context:** Use `capture()` if you want to add user IDs, session IDs, or tags to your traces (see [Using `capture()` for Context and Boundaries](#using-capture-for-context-and-boundaries)).

### With Sentry

Initialize Sentry first, then Latitude. Sentry installs an OpenTelemetry `BasicTracerProvider`; Latitude detects it and adds its processor without replacing Sentry's context manager, propagator, sampler, or span processor:

```typescript
import * as Sentry from "@sentry/node";
import { Latitude } from "@latitude-data/telemetry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});

await latitude.ready;

// LLM calls are now traced and sent to both Sentry and Latitude.
await latitude.flush();
await latitude.shutdown(); // Does not shut down Sentry.
```

**Adding context:** Use `capture()` if you want to add user IDs, session IDs, or tags to your traces (see [Using `capture()` for Context and Boundaries](#using-capture-for-context-and-boundaries)).

### With New Relic

Enable New Relic's OpenTelemetry bridge first, then construct `new Latitude()`. New Relic registers an OpenTelemetry `BasicTracerProvider`; Latitude attaches to that provider when possible and only shuts down Latitude's own processor.

```typescript
import "newrelic";
import { Latitude } from "@latitude-data/telemetry";

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});
```

### With Honeycomb

Start Honeycomb's `HoneycombSDK` first, then construct `new Latitude()`. Honeycomb extends OpenTelemetry's `NodeSDK`, so Latitude reuses the global provider created by `sdk.start()`.

```typescript
import { HoneycombSDK } from "@honeycombio/opentelemetry-node";
import { Latitude } from "@latitude-data/telemetry";

const honeycomb = new HoneycombSDK({ serviceName: "my-app" });
honeycomb.start();

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
});
```

## Supported AI Providers

| Identifier        | Package                           |
| ----------------- | --------------------------------- |
| `"openai"`        | `openai`                          |
| `"openai-agents"` | `@openai/agents`                  |
| `"anthropic"`     | `@anthropic-ai/sdk`               |
| `"bedrock"`    | `@aws-sdk/client-bedrock-runtime` |
| `"cohere"`     | `cohere-ai`                       |
| `"langchain"`  | `langchain`                       |
| `"llamaindex"` | `llamaindex`                      |
| `"togetherai"` | `together-ai`                     |
| `"vertexai"`   | `@google-cloud/vertexai`          |
| `"aiplatform"` | `@google-cloud/aiplatform`        |

## Context Options

`capture()` accepts these context options:

| Option      | Type                      | OTel Attribute          | Description                  |
| ----------- | ------------------------- | ----------------------- | ---------------------------- |
| `name`      | `string`                  | `latitude.capture.name` | Name for the capture context |
| `tags`      | `string[]`                | `latitude.tags`         | Tags for filtering traces    |
| `metadata`  | `Record<string, unknown>` | `latitude.metadata`     | Arbitrary key-value metadata |
| `sessionId` | `string`                  | `session.id`            | Group traces by session      |
| `userId`    | `string`                  | `user.id`               | Associate traces with a user |

## Configuration Options

### Smart Filtering

By default, only LLM-relevant spans are exported:

```typescript
new LatitudeSpanProcessor(apiKey, projectSlug, {
  disableSmartFilter: true, // Export all spans
});
```

### Redaction

PII redaction is enabled by default for security-sensitive attributes only:

**Redacted by default:**

- HTTP authorization headers
- HTTP cookies
- HTTP API key headers (`x-api-key`)
- Database statements

```typescript
new LatitudeSpanProcessor(apiKey, projectSlug, {
  disableRedact: true, // Disable all redaction
  redact: {
    attributes: [/^password$/i, /secret/i], // Add custom patterns
    mask: (attr, value) => "[REDACTED]",
  },
});
```

### Custom Filtering

```typescript
new LatitudeSpanProcessor(apiKey, projectSlug, {
  shouldExportSpan: (span) => span.attributes["custom"] === true,
  blockedInstrumentationScopes: ["opentelemetry.instrumentation.fs"],
});
```

## Environment Variables

| Variable                 | Default                                                             | Description            |
| ------------------------ | ------------------------------------------------------------------- | ---------------------- |
| `LATITUDE_TELEMETRY_URL` | `http://localhost:3002` (dev) / `https://ingest.latitude.so` (prod) | OTLP exporter endpoint |

## Troubleshooting

### Spans not appearing in Latitude

1. **Check API key and project slug** — Must be non-empty strings
2. **Verify instrumentations are registered** — Use `await registerLatitudeInstrumentations()`
3. **Flush before exit** — Call `await latitude.flush()` or `await provider.forceFlush()`
4. **Check smart filter** — Only LLM spans are exported by default. Use `disableSmartFilter: true` to export all spans
5. **Ensure `capture()` wraps the code that creates spans** — `capture()` itself doesn't create spans; it only attaches context to spans created by instrumentations

### No spans created inside `capture()`

`capture()` only attaches context. You need:

1. An active instrumentation (e.g., `@traceloop/instrumentation-openai`)
2. That instrumentation to create spans for the operations inside your callback

### Context not propagating

Ensure you have a functioning OpenTelemetry context manager registered:

```typescript
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context } from "@opentelemetry/api";

context.setGlobalContextManager(new AsyncLocalStorageContextManager());
```

`new Latitude()` does this automatically. For shared-provider setups, your app's existing OTel setup should already have this.

## License

MIT
