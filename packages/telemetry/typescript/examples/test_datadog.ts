/**
 * Integrate Latitude with Datadog.
 *
 * This example shows how to use Latitude alongside Datadog's OTel
 * TracerProvider for LLM observability. Datadog handles infrastructure
 * monitoring, while Latitude provides specialized LLM analytics.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - DD_API_KEY (for Datadog agent)
 * - OPENAI_API_KEY
 *
 * Install: npm install openai dd-trace
 */

import tracer from "dd-trace"
import OpenAI from "openai"
import { capture, LatitudeSpanProcessor } from "../src"

// ─── 1. Initialize Datadog (native SDK) ──────────────────

tracer.init({
  service: "my-app",
  env: "production",
  version: "1.0.0",
  // dd-trace auto-instruments HTTP, DB, etc. and sends to Datadog
})

// ─── 2. Add Latitude to Datadog's OTel provider ─────────────

// Datadog's TracerProvider supports OTel span processors
const provider = new tracer.TracerProvider()

provider.addSpanProcessor(new LatitudeSpanProcessor(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!))

provider.register()

// ─── 3. Use instrumented clients ──────────────────────────

const openai = new OpenAI()

async function main() {
  // Datadog and Latitude share spans:
  // - Datadog sees: all spans (HTTP, LLM, etc.)
  // - Latitude sees: LLM spans with gen_ai.* attributes

  await capture(
    "datadog-chat",
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
