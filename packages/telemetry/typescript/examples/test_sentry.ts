/**
 * Integrate Latitude with Sentry.
 *
 * This example shows how to use Latitude alongside Sentry for LLM
 * observability. Sentry handles error tracking and general performance,
 * while Latitude provides specialized LLM analytics.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - SENTRY_DSN
 * - OPENAI_API_KEY
 *
 * Install: npm install openai @sentry/node
 */

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import * as Sentry from "@sentry/node"
import OpenAI from "openai"
import { capture, LatitudeSpanProcessor, registerLatitudeInstrumentations } from "../src"

// ─── 1. Initialize Sentry (native SDK) ───────────────────

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Sentry auto-instruments HTTP, DB, etc. and sends to Sentry
})

// ─── 2. Add Latitude to Sentry's OTel provider ─────────────

// Get Sentry's tracer provider (when using Sentry's OTel integration)
// Note: This requires Sentry's custom OTel setup. See Sentry docs for details.
const provider = new NodeTracerProvider({
  spanProcessors: [new LatitudeSpanProcessor(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!)],
})

await registerLatitudeInstrumentations({
  instrumentations: ["openai"],
  tracerProvider: provider,
})

provider.register()

// ─── 3. Use instrumented clients ──────────────────────────

const openai = new OpenAI()

async function main() {
  // Sentry and Latitude share the provider:
  // - Sentry sees: all spans (HTTP, LLM, etc.)
  // - Latitude sees: LLM spans with gen_ai.* attributes

  await capture(
    "sentry-chat",
    async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }],
      })
      return response.choices[0]?.message?.content
    },
    { tags: ["production"], sessionId: "user-123", userId: "alice" },
  )

  // Errors are automatically captured by Sentry
  try {
    await openai.chat.completions.create({
      model: "invalid-model",
      messages: [{ role: "user", content: "This will fail" }],
    })
  } catch (error) {
    Sentry.captureException(error)
    console.log("Error captured by Sentry")
  }

  await provider.forceFlush()
  await provider.shutdown()
}

main().catch(console.error)
