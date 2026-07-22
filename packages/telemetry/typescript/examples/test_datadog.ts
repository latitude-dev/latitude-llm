/**
 * Integrate Latitude with Datadog (composable mode).
 *
 * Run Latitude's LLM observability alongside Datadog's OTel TracerProvider:
 * Datadog handles infrastructure monitoring, Latitude provides LLM analytics.
 *
 * `tracer.init()` registers Datadog's global OTel provider; `new Latitude()`
 * then DISCOVERS that provider and attaches its span processor + LLM
 * instrumentation to it (no competing provider is registered). This is the
 * documented Datadog coexistence pattern.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - DD_API_KEY (for the Datadog agent)
 * - OPENAI_API_KEY
 *
 * Install: npm install openai dd-trace @traceloop/instrumentation-openai
 */

import { randomUUID } from "node:crypto"
import tracer from "dd-trace"
import OpenAI from "openai"
import { capture, Latitude } from "../src"
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `datadog-${randomUUID().slice(0, 8)}`

// ─── 1. Initialize Datadog (registers its global OTel provider) ───
tracer.init({
  service: "my-app",
  env: "production",
  version: "1.0.0",
})

// ─── 2. Attach Latitude — it discovers Datadog's provider and piggy-backs ───
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
  disableBatch: true,
})

async function main() {
  // Create the client only after instrumentation has been registered.
  await latitude.ready
  const openai = new OpenAI()

  const result = await capture(
    "datadog-chat",
    async () => {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "Say 'Hello from Datadog coexist!' in exactly 5 words." },
        ],
        max_completion_tokens: MAX_TOKENS,
      })
      return response.choices[0]?.message?.content
    },
    {
      tags: ["example", "datadog-ts", "production"],
      sessionId: SESSION_ID,
      userId: "example-user",
      metadata: { scenario: "datadog-coexist", environment: "local" },
    },
  )
  console.log("datadog-chat →", result)

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
