/**
 * Integrate Latitude with an existing OpenTelemetry setup.
 *
 * This example shows how to add Latitude to an application that already
 * uses OpenTelemetry for observability (e.g., with Jaeger, Zipkin, or
 * another backend).
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai @opentelemetry/sdk-trace-node
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import OpenAI from "openai"
import { capture, LatitudeSpanProcessor, registerLatitudeInstrumentations } from "../src"

// ─── 1. Your existing OTel setup ─────────────────────────

const existingExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces", // Your existing backend (Jaeger, etc.)
})

// ─── 2. Add Latitude for LLM observability ────────────────

// Configure both processors upfront (recommended approach)
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "my-existing-app",
  }),
  spanProcessors: [
    // Your existing span processor — receives all spans
    new BatchSpanProcessor(existingExporter),
    // Latitude processor — smart filter only exports LLM-relevant spans
    new LatitudeSpanProcessor(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!),
  ],
})

provider.register()

// Enable LLM auto-instrumentation
await registerLatitudeInstrumentations({
  instrumentations: ["openai"],
  tracerProvider: provider,
})

// ─── 3. Use instrumented clients ──────────────────────────

const openai = new OpenAI()

async function main() {
  // This creates spans that go to BOTH backends:
  // - Your existing OTel backend (Jaeger, etc.) — all spans
  // - Latitude — LLM spans only (with smart filtering)

  await capture(
    "existing-otel-chat",
    async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }],
      })
      return response.choices[0]?.message?.content
    },
    { tags: ["production"], sessionId: "user-123", userId: "alice" },
  )

  await provider.forceFlush()
  await provider.shutdown()
}

main().catch(console.error)
