---
title: OpenTelemetry Exporter (OTEL)
description: Connect any OpenTelemetry-instrumented application to Latitude, regardless of language or framework.
---

# Connect with Any OpenTelemetry Exporter

Latitude's ingestion endpoint speaks standard **OTLP over HTTP**. 

If your language has an OpenTelemetry SDK (Go, Java, Ruby, Rust, .NET, Elixir, PHP, etc.), you can send traces to Latitude without a Latitude-specific library.

<Info>
  Using **TypeScript** or **Python**? The dedicated SDKs handle all of this for you with a single function call. See the [TypeScript SDK](typescript) or [Python SDK](python) instead.
</Info>

## Prerequisites

1. A **Latitude API key** — generate one from your project settings in the Latitude dashboard.
2. Your **project slug** — visible in the project settings or URL.

## Endpoint and Headers

| | Value |
|---|---|
| **URL** | `https://ingest.latitude.so/v1/traces` |
| **Method** | `POST` |
| **`Authorization`** | `Bearer <your-api-key>` |
| **`X-Latitude-Project`** | `<your-project-slug>` |
| **`Content-Type`** | `application/json` or `application/x-protobuf` |

The endpoint accepts a standard OTLP `ExportTraceServiceRequest` body and returns **`202`** on success.

## Verify with curl

A minimal request to confirm connectivity (replace the placeholders):

```bash
curl -X POST https://ingest.latitude.so/v1/traces \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Latitude-Project: YOUR_PROJECT_SLUG" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": { "stringValue": "my-service" }
        }]
      },
      "scopeSpans": [{
        "scope": { "name": "manual-test" },
        "spans": [{
          "traceId": "00000000000000000000000000000001",
          "spanId": "0000000000000001",
          "name": "test-span",
          "kind": 1,
          "startTimeUnixNano": "1700000000000000000",
          "endTimeUnixNano": "1700000001000000000",
          "attributes": [{
            "key": "gen_ai.system",
            "value": { "stringValue": "openai" }
          }]
        }]
      }]
    }]
  }'
```

A `202` response with `{}` means the endpoint accepted your payload.

## Language Examples

Every OpenTelemetry SDK lets you configure an OTLP HTTP exporter with a custom endpoint and headers. Below are the key configuration snippets — the rest of your OTel setup (tracer provider, instrumentations, etc.) stays the same as usual.

### Go

```go
import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
)

exporter, err := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpointURL("https://ingest.latitude.so/v1/traces"),
    otlptracehttp.WithHeaders(map[string]string{
        "Authorization":      "Bearer " + apiKey,
        "X-Latitude-Project": projectSlug,
    }),
)

provider := trace.NewTracerProvider(trace.WithBatcher(exporter))
```

### Java

```java
import io.opentelemetry.exporter.otlp.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;

OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
    .setEndpoint("https://ingest.latitude.so/v1/traces")
    .addHeader("Authorization", "Bearer " + apiKey)
    .addHeader("X-Latitude-Project", projectSlug)
    .build();

SdkTracerProvider provider = SdkTracerProvider.builder()
    .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
    .build();
```

### Ruby

```ruby
require "opentelemetry-sdk"
require "opentelemetry-exporter-otlp"

ENV["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = "https://ingest.latitude.so/v1/traces"
ENV["OTEL_EXPORTER_OTLP_TRACES_HEADERS"] = "Authorization=Bearer #{api_key},X-Latitude-Project=#{project_slug}"

OpenTelemetry::SDK.configure do |c|
  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new
    )
  )
end
```

### .NET

```csharp
using OpenTelemetry;
using OpenTelemetry.Trace;
using OpenTelemetry.Exporter;

var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .AddOtlpExporter(opt =>
    {
        opt.Endpoint = new Uri("https://ingest.latitude.so/v1/traces");
        opt.Headers = $"Authorization=Bearer {apiKey},X-Latitude-Project={projectSlug}";
        opt.Protocol = OtlpExportProtocol.HttpProtobuf;
    })
    .Build();
```

### Environment Variables (Any Language)

Most OpenTelemetry SDKs respect standard environment variables, so you can often skip code changes entirely:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://ingest.latitude.so/v1/traces"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer YOUR_API_KEY,X-Latitude-Project=YOUR_PROJECT_SLUG"
```

## Latitude Span Attributes

All spans reaching the endpoint are ingested. To get the most out of the Latitude UI (filtering by user, session, tags), set these optional span attributes:

| Attribute | Type | Description |
|---|---|---|
| `latitude.capture.name` | `string` | A name for the capture context (e.g. `"handle-user-request"`) |
| `latitude.tags` | `string` (JSON array) | Tags for filtering, e.g. `'["production","v2"]'` |
| `latitude.metadata` | `string` (JSON object) | Arbitrary key-value pairs, e.g. `'{"requestId":"abc"}'` |
| `session.id` | `string` | Group related traces into a session |
| `user.id` | `string` | Associate traces with a specific user |

Set these as standard OTel span attributes. Example in Go:

```go
span.SetAttributes(
    attribute.String("user.id", "user_123"),
    attribute.String("session.id", "session_abc"),
    attribute.String("latitude.tags", `["production","v2-agent"]`),
    attribute.String("latitude.metadata", `{"requestId":"req-xyz"}`),
)
```

## GenAI Span Attributes (LLM Metadata)

<Warning>
  Configuring the OTLP exporter (endpoint + headers) only ensures your spans **reach** Latitude. For Latitude to display LLM call details — model name, token counts, input/output messages — your spans must carry the [OpenTelemetry GenAI semantic convention](https://opentelemetry.io/docs/specs/semconv/gen-ai/) attributes described below.

  Without these attributes, traces will appear in the dashboard but show no model, token usage, or message content.
</Warning>

Latitude follows the **[OpenTelemetry Semantic Conventions for Generative AI](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)** (v1.37+). When your spans include `gen_ai.*` attributes, the Latitude UI displays full LLM call details: the provider, model, input/output messages, token usage, cost, and latency.

Refer to the [GenAI span semconv spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/) for the full attribute list. The message content attributes use the standard OpenTelemetry GenAI **parts-based** message format, shown below.

### Message Format

Latitude expects the standard **parts-based** GenAI message format. Each message has a `role` and an array of `parts`:

**`gen_ai.input.messages`** (JSON string):

```json
[
  {
    "role": "user",
    "parts": [{"type": "text", "content": "What is the capital of France?"}]
  }
]
```

**`gen_ai.output.messages`** (JSON string):

```json
[
  {
    "role": "assistant",
    "parts": [{"type": "text", "content": "The capital of France is Paris."}]
  }
]
```

**`gen_ai.system_instructions`** (JSON string):

```json
[{"type": "text", "content": "You are a helpful geography assistant."}]
```

## Existing Observability Stack

Latitude works alongside your existing observability tools. In TypeScript, `new Latitude()` detects common OpenTelemetry-compatible providers (Sentry, Datadog, New Relic, Honeycomb, and custom OTel SDKs) and attaches Latitude when possible. In Python, `Latitude(...)` attaches to the registered OpenTelemetry provider when one already exists or creates one when none exists. Custom setups in either SDK can also add `LatitudeSpanProcessor` as an additional span processor so traces go to both Latitude and your current backend.

`await latitude.ready` is optional in these examples. Use it during startup only when you need to guarantee Latitude's instrumentations are registered before the first LLM call.

### With Datadog (TypeScript)

```ts
import tracer from "dd-trace"
import { Latitude } from "@latitude-data/telemetry"

tracer.init({ service: "my-app", env: "production" })

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})
```

### With Sentry (TypeScript)

```ts
import * as Sentry from "@sentry/node"
import { Latitude } from "@latitude-data/telemetry"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
})

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})
```

### With New Relic (TypeScript)

Enable New Relic's OpenTelemetry bridge first, then construct `new Latitude()`. New Relic registers an OpenTelemetry provider that Latitude can reuse.

```ts
import "newrelic"
import { Latitude } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})
```

### With Honeycomb (TypeScript)

Start Honeycomb's `HoneycombSDK` first, then construct `new Latitude()`. Honeycomb registers an OpenTelemetry provider that Latitude can reuse.

```ts
import { HoneycombSDK } from "@honeycombio/opentelemetry-node"
import { Latitude } from "@latitude-data/telemetry"

const honeycomb = new HoneycombSDK({ serviceName: "my-app" })
honeycomb.start()

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})
```

### Other Platforms

For any observability platform that supports OpenTelemetry (Jaeger, Grafana Tempo, etc.), the pattern is the same: initialize the existing SDK first and then construct `Latitude`, or configure an additional OTLP exporter pointed at `https://ingest.latitude.so/v1/traces` with the required `Authorization` and `X-Latitude-Project` headers alongside your existing exporter.

## Troubleshooting

### 401 Unauthorized

The `Authorization` header must use the `Bearer ` prefix (with a space). Double-check your API key is valid and not expired.

### 400 Bad Request — missing project header

The `X-Latitude-Project` header is required on every request. Ensure it is present and spelled correctly, and that the value matches a project slug in the organization associated with your API key.

### 202 but no traces visible

- **Empty body:** An empty request body is accepted with `202` but produces no traces. Ensure your exporter is actually attaching span data.
- **Smart filter (SDK only):** If you are using a Latitude SDK's `LatitudeSpanProcessor`, only LLM-relevant spans are exported by default. This does not apply when sending OTLP directly — all spans are ingested.
- **Flush before exit:** Make sure your tracer provider flushes pending spans before the process exits.

### Traces appear but show no model, tokens, or messages

This is the most common issue when integrating via the generic OTLP exporter. Your exporter is configured correctly (you get `202` and traces appear), but the Latitude UI shows empty LLM metadata.

**Cause:** Your spans are missing the `gen_ai.*` semantic convention attributes. Configuring the exporter only ensures spans reach Latitude — it does not add LLM metadata. You must explicitly set attributes like `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.input.messages`, etc. on your spans.

**Fix:** See [GenAI Span Attributes (LLM Metadata)](#genai-span-attributes-llm-metadata) above for the full list of attributes and message format. At a minimum, set:

1. `gen_ai.provider.name` — provider name (e.g. `"openai"`, `"anthropic"`). Latitude also accepts the deprecated `gen_ai.system` as a fallback for older emitters.
2. `gen_ai.request.model` — model name
3. `gen_ai.operation.name` — set to `"chat"`
4. `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens` — token counts
5. `gen_ai.input.messages` and `gen_ai.output.messages` — the actual conversation content

<Note>
  If you use a Latitude SDK or an OpenTelemetry auto-instrumentation library (e.g. `opentelemetry-instrumentation-openai`), these attributes are set automatically. This section only applies when you manually create spans for LLM calls without auto-instrumentation.
</Note>

### Encoding

The endpoint accepts both `application/json` (JSON-encoded OTLP) and `application/x-protobuf` (protobuf-encoded OTLP). Most OTel SDK exporters default to protobuf; both work.
