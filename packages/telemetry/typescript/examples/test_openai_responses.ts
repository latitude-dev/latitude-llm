/**
 * OpenAI Responses API — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai @traceloop/instrumentation-openai
 *
 * The Responses API delivers the system prompt out-of-band via the top-level
 * `instructions` field (not a `role:"system"` message), so this example also
 * verifies Latitude lands it in `systemInstructions`.
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

const PROVIDER = "openai-responses"
const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

const client = new OpenAI()

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "openai-responses-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const response = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM,
    input: "Say 'Hello from OpenAI Responses!' in exactly 5 words.",
    max_output_tokens: MAX_TOKENS,
  })
  return response.output_text
}

async function stream() {
  const stream = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM,
    input: "Say 'Hello from OpenAI Responses stream!' in exactly 6 words.",
    max_output_tokens: MAX_TOKENS,
    stream: true,
  })

  const chunks: string[] = []
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") chunks.push(event.delta)
  }
  return chunks.join("")
}

async function toolConversation() {
  const tools: OpenAI.Responses.Tool[] = [
    {
      type: "function",
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
      strict: false,
    },
  ]
  const input: OpenAI.Responses.ResponseInputItem[] = [
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM,
    input,
    tools,
    max_output_tokens: MAX_TOKENS,
  })
  input.push(...first.output)
  for (const item of first.output) {
    if (item.type === "function_call") {
      input.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
      })
    }
  }

  const second = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM,
    input,
    tools,
    max_output_tokens: MAX_TOKENS,
  })
  return second.output_text
}

async function main() {
  await latitude.ready

  await capture("openai-responses-chat-capture", chat, ctx("chat"))
  await capture("openai-responses-stream-capture", stream, ctx("stream", "stream"))
  await capture("openai-responses-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
