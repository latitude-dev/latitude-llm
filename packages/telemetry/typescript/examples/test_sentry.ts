/**
 * Integrate Latitude with Sentry (composable mode).
 *
 * Run Latitude's LLM observability alongside Sentry: Sentry handles error
 * tracking + general performance, Latitude provides LLM analytics.
 *
 * `Sentry.init()` registers Sentry's global OTel provider; `new Latitude()`
 * then DISCOVERS that provider and attaches its span processor + LLM
 * instrumentation to it (no competing provider is registered). This is the
 * documented Sentry coexistence pattern — Latitude must be constructed second.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - SENTRY_DSN
 * - OPENAI_API_KEY
 *
 * Install: npm install openai @sentry/node
 */

import { randomUUID } from "node:crypto"
import * as Sentry from "@sentry/node"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `sentry-${randomUUID().slice(0, 8)}`

// ─── 1. Initialize Sentry (registers its global OTel provider) ───
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
})

// ─── 2. Attach Latitude SECOND — it discovers Sentry's provider and piggy-backs ───
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
  disableBatch: true,
})

async function main() {
  // Create the client only after instrumentation has been registered.
  await latitude.ready
  const openai = new OpenAI()

  const result = await capture(
    "sentry-chat",
    async () => {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "Say 'Hello from Sentry coexist!' in exactly 5 words." },
        ],
        max_completion_tokens: MAX_TOKENS,
      })
      return response.choices[0]?.message?.content
    },
    {
      tags: ["example", "sentry-ts", "production"],
      sessionId: SESSION_ID,
      userId: "example-user",
      metadata: { scenario: "sentry-coexist", environment: "local" },
    },
  )
  console.log("sentry-chat →", result)

  // Errors are automatically captured by Sentry.
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
