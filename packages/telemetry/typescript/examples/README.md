# Latitude Telemetry Examples

This directory contains examples demonstrating how to use the Latitude Telemetry SDK with various AI providers and integrations.

## Quick Start (Happy Path)

The simplest way to use Latitude is with `new Latitude({...})` — no existing OpenTelemetry setup required.

```typescript
import OpenAI from "openai"
import { Latitude, capture } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI }, // Pass the LLM SDK module you use in app code.
})

await latitude.ready
const client = new OpenAI()

await capture(
  "chat-call",
  async () => {
    return await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello!" }],
    })
  },
  { tags: ["production"], userId: "user-123" },
)

await latitude.flush()
```

See `test_openai.ts` for a complete working example.

---

## Setup

1. **Start your local Latitude instance** at `localhost:8787`

2. **Set up environment variables:**

   **Option A: Using .env file (recommended)**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

   **Option B: Export in shell**
   ```bash
   export LATITUDE_API_KEY="your-latitude-api-key"
   export LATITUDE_PROJECT_SLUG="your-project-slug"
   export LATITUDE_TELEMETRY_URL="http://localhost:8787"
   
   # Provider-specific API keys (see table below)
   export OPENAI_API_KEY="your-openai-key"
   ```

3. **Install the provider SDK** you want to test:
   ```bash
   npm install openai
   ```

4. **Run an example:**
   ```bash
   # If using .env file (Node 20+)
   npx tsx --env-file=.env test_openai.ts
   
   # If you exported env vars in shell
   npx tsx test_openai.ts
   ```

5. **Check your Latitude dashboard** at `http://localhost:8080`

---

## AI Provider Examples (Happy Path)

These examples use `LatitudeTelemetry` — the simplest way to get started.

| Provider | File | Required Package | Instrumentation |
|----------|------|------------------|-----------------|
| OpenAI | `test_openai.ts` | `openai` | `"openai"` |
| OpenAI Agents SDK | `test_openai_agents.ts` | `@openai/agents` | `"openai-agents"` |
| Anthropic | `test_anthropic.ts` | `@anthropic-ai/sdk` | `"anthropic"` |
| Azure OpenAI | `test_azure.ts` | `openai` | `"openai"` |
| Cohere | `test_cohere.ts` | `cohere-ai` | `"cohere"` |
| Together AI | `test_together.ts` | `together-ai` | `"togetherai"` |
| AWS Bedrock | `test_bedrock.ts` | `@aws-sdk/client-bedrock-runtime` | `"bedrock"` |
| Google Vertex AI | `test_vertex.ts` | `@google-cloud/vertexai` | `"vertexai"` |
| Vercel AI SDK | `test_vercel_ai.ts` | `ai`, `@ai-sdk/openai` | custom tracer (`"vercelai"`) |
| LangChain | `test_langchain.ts` | `langchain`, `@langchain/openai` | `"langchain"` |
| LlamaIndex | `test_llamaindex.ts` | `llamaindex` | `"llamaindex"` |

The Vercel AI SDK example shows both patterns: one generation wrapped in `capture()` and one plain AI SDK call using the stable `experimental_telemetry` hook with `getLatitudeTracer("vercelai")`. It does not require a Latitude auto-instrumentation entry.

### Running Provider Examples

```bash
# OpenAI example
npx tsx --env-file=.env test_openai.ts

# Anthropic example
npx tsx --env-file=.env test_anthropic.ts

# LangChain example
npx tsx --env-file=.env test_langchain.ts

# Vercel AI SDK example
npx tsx --env-file=.env test_vercel_ai.ts
```

---

## Integration Examples (Composable Mode)

These examples show how to integrate Latitude with existing observability tools using `LatitudeSpanProcessor` and `NodeTracerProvider`.

| Integration | File | Use Case |
|-------------|------|----------|
| Datadog | `test_datadog.ts` | Run Latitude alongside Datadog APM |
| Sentry | `test_sentry.ts` | Run Latitude alongside Sentry error tracking |
| Existing OTel | `test_existing_otel.ts` | Add Latitude to existing Jaeger/Zipkin setup |

### When to Use Composable Mode

Use composable mode when:
- You already have OpenTelemetry set up (Jaeger, Zipkin, etc.)
- You're using Datadog, Sentry, or other APM tools
- You need multiple telemetry backends simultaneously

```typescript
import OpenAI from "openai"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { LatitudeSpanProcessor, registerLatitudeInstrumentations } from "@latitude-data/telemetry"

const provider = new NodeTracerProvider({
  spanProcessors: [
    new LatitudeSpanProcessor(apiKey, project),
  ],
})

await registerLatitudeInstrumentations({
  instrumentations: { openai: OpenAI },
  tracerProvider: provider,
})

provider.register()
```

---

## Environment Variables Reference

### Required for All Examples

| Variable | Description |
|----------|-------------|
| `LATITUDE_API_KEY` | Your Latitude API key |
| `LATITUDE_PROJECT_SLUG` | Your Latitude project slug |
| `LATITUDE_TELEMETRY_URL` | OTLP endpoint (default: `http://localhost:8787`) |

### Provider-Specific Variables

| Variable | Required For |
|----------|--------------|
| `OPENAI_API_KEY` | OpenAI, Azure OpenAI, LangChain, LlamaIndex, Vercel AI SDK |
| `ANTHROPIC_API_KEY` | Anthropic |
| `COHERE_API_KEY` | Cohere |
| `TOGETHER_API_KEY` | Together AI |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | AWS Bedrock |
| `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_ENDPOINT` | Azure OpenAI |
| `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_CLOUD_PROJECT` | Vertex AI |
| `SENTRY_DSN` | Sentry integration |
| `DD_API_KEY` | Datadog integration |

---

## Expected Behavior

Each example should:

1. Initialize telemetry with the appropriate instrumentation
2. Make an LLM call wrapped in `telemetry.capture()` (or `capture()` for composable mode)
3. Print the response to console
4. Send a trace to your local Latitude instance

Check the Latitude dashboard to verify:

- ✅ The trace appears with the correct tags
- ✅ Input/output messages are captured
- ✅ Token usage is recorded (where supported by the instrumentation)
- ✅ Model information is correct
- ✅ User ID and session ID are associated with the trace

---

## Troubleshooting

### Spans not appearing in Latitude

1. **Check environment variables** are set correctly
2. **Verify Latitude is running** at `LATITUDE_TELEMETRY_URL`
3. **Call `flush()`** before exit: `await telemetry.flush()`
4. **Check smart filter** — only LLM spans are exported by default

### ESM module loading issues

The object form of `instrumentations` always passes the consumer's own module reference,
so ESM/CJS dual-bundle mismatches can't happen by design. If spans are still missing, make
sure the module you pass is the same one your LLM client is constructed from (e.g. one
`openai` resolution in the dependency tree, not two duplicates).

### Type errors in examples

The examples use provider SDKs that may not be installed. These are expected and don't affect the actual SDK functionality.
