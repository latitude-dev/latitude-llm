/**
 * Cohere — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - COHERE_API_KEY
 *
 * Install: npm install cohere-ai @traceloop/instrumentation-cohere
 */

import { randomUUID } from "node:crypto"
import * as CohereSDK from "cohere-ai"
import { CohereClient } from "cohere-ai"
import { capture, Latitude } from "../src"
import { createCohereInstrumentation } from "../src/instrumentations/cohere.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createCohereInstrumentation(CohereSDK)],
})

const PROVIDER = "cohere"
const MODEL = "command-r"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const client = new CohereClient({
    token: process.env.COHERE_API_KEY,
  })

  const response = await client.chat({
    model: MODEL,
    message: "Say 'Hello from Cohere!' in exactly 5 words.",
    maxTokens: 50,
  })

  return response.text
}

async function main() {
  await latitude.ready

  await chat()

  await capture("cohere-chat-capture", chat, ctx("chat"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
