/**
 * Integrate Latitude with an existing OpenTelemetry setup — Latitude telemetry example.
 *
 * Add Latitude to an app that already uses OpenTelemetry (Jaeger, Zipkin, an
 * OTLP collector, …). Both processors live on the SAME user-owned provider:
 * the existing BatchSpanProcessor receives every span; Latitude's processor
 * smart-filters to LLM-relevant spans and ships them to Latitude.
 *
 * `registerLatitudeInstrumentations` enables the LLM auto-instrumentation
 * against that provider (the composable counterpart to `new Latitude()`).
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Optional env vars:
 * - OTEL_EXISTING_BACKEND_URL  (your existing OTLP backend; defaults to http://localhost:4318/v1/traces)
 *
 * Install: npm install openai @opentelemetry/sdk-trace-node
 */

import { randomUUID } from "node:crypto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import OpenAI from "openai"
import { capture, LatitudeSpanProcessor, registerLatitudeInstrumentations } from "../src"

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `existing-otel-${randomUUID().slice(0, 8)}`

// ─── 1. Your existing OTel setup (Jaeger/Zipkin/collector) ───
const existingExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXISTING_BACKEND_URL ?? "http://localhost:4318/v1/traces",
})

// ─── 2. Add Latitude as an additional span processor on the same provider ───
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "my-existing-app",
  }),
  spanProcessors: [
    // Your existing processor — receives all spans.
    new BatchSpanProcessor(existingExporter),
    // Latitude processor — smart filter only exports LLM-relevant spans.
    new LatitudeSpanProcessor(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, { disableBatch: true }),
  ],
})

provider.register()

// Enable LLM auto-instrumentation against the existing provider.
await registerLatitudeInstrumentations({
  instrumentations: { openai: OpenAI },
  tracerProvider: provider,
})

const openai = new OpenAI()

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", "existing-otel-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function toolConversation() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get the current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ]
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence." },
  ]

  const first = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  return second.choices[0]?.message?.content
}

async function main() {
  const result = await capture("existing-otel-tools", toolConversation, ctx("tools", "tools"))
  console.log("existing-otel-tools →", result)

  await provider.forceFlush()
  await provider.shutdown()
}

main().catch(console.error)
