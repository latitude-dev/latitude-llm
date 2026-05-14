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

import * as Sentry from "@sentry/node"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

// ─── 1. Initialize Sentry (native SDK) ───────────────────

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Sentry auto-instruments HTTP, DB, etc. and sends to Sentry
})

// ─── 2. Initialize Latitude second ────────────────────────

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})

await latitude.ready

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

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
