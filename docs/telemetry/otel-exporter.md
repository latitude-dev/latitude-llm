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

## Existing Observability Stack

Latitude works alongside your existing observability tools. Add `LatitudeSpanProcessor` as an additional span processor so traces go to both Latitude and your current backend.

### With Datadog (TypeScript)

```ts
import tracer from "dd-trace"
import { LatitudeSpanProcessor } from "@latitude-data/telemetry"

tracer.init({ service: "my-app", env: "production" })

const provider = new tracer.TracerProvider()

provider.addSpanProcessor(
  new LatitudeSpanProcessor(
    process.env.LATITUDE_API_KEY!,
    process.env.LATITUDE_PROJECT_SLUG!,
  ),
)

provider.register()
```

### With Sentry (TypeScript)

```ts
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import * as Sentry from "@sentry/node"
import {
  LatitudeSpanProcessor,
  registerLatitudeInstrumentations,
} from "@latitude-data/telemetry"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
})

const provider = new NodeTracerProvider({
  spanProcessors: [
    new LatitudeSpanProcessor(
      process.env.LATITUDE_API_KEY!,
      process.env.LATITUDE_PROJECT_SLUG!,
    ),
  ],
})

await registerLatitudeInstrumentations({
  instrumentations: ["openai"],
  tracerProvider: provider,
})

provider.register()
```

### Other Platforms

For any observability platform that supports OpenTelemetry (Jaeger, Grafana Tempo, Honeycomb, etc.), the pattern is the same: configure an additional OTLP exporter pointed at `https://ingest.latitude.so/v1/traces` with the required `Authorization` and `X-Latitude-Project` headers alongside your existing exporter.

## Troubleshooting

### 401 Unauthorized

The `Authorization` header must use the `Bearer ` prefix (with a space). Double-check your API key is valid and not expired.

### 400 Bad Request — missing project header

The `X-Latitude-Project` header is required on every request. Ensure it is present and spelled correctly, and that the value matches a project slug in the organization associated with your API key.

### 202 but no traces visible

- **Empty body:** An empty request body is accepted with `202` but produces no traces. Ensure your exporter is actually attaching span data.
- **Smart filter (SDK only):** If you are using a Latitude SDK's `LatitudeSpanProcessor`, only LLM-relevant spans are exported by default. This does not apply when sending OTLP directly — all spans are ingested.
- **Flush before exit:** Make sure your tracer provider flushes pending spans before the process exits.

### Encoding

The endpoint accepts both `application/json` (JSON-encoded OTLP) and `application/x-protobuf` (protobuf-encoded OTLP). Most OTel SDK exporters default to protobuf; both work.
