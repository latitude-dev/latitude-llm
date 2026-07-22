/**
 * LlamaIndex — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install llamaindex @llamaindex/openai @llamaindex/workflow zod
 *
 * NOTE: LLM spans are NOT captured here — the upstream Traceloop instrumentor only instruments the
 * OpenAI LLM when @llamaindex/openai is passed as a second `manuallyInstrument` arg (it lives in its
 * own package), and it drops agent tool-calls / streaming usage even then. Documented as an upstream
 * limitation in specs/telemetry-qa.md (#7); kept for when we ship our own instrumentor.
 */

import { randomUUID } from "node:crypto"
import { openai } from "@llamaindex/openai"
import { agent } from "@llamaindex/workflow"
import * as LlamaIndex from "llamaindex"
import { type ChatMessage, tool } from "llamaindex"
import { z } from "zod"
import { capture, Latitude } from "../src"
import { createLlamaIndexInstrumentation } from "../src/instrumentations/llamaindex.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createLlamaIndexInstrumentation(LlamaIndex)],
})

const PROVIDER = "llamaindex"
const MODEL = "gpt-5.5"
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "llamaindex-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

const getWeather = tool({
  name: "get_weather",
  description: "Get the current weather for a city",
  parameters: z.object({ city: z.string() }),
  execute: ({ city }) => JSON.stringify({ city, temperatureC: 21, conditions: "sunny" }),
})

async function chat() {
  const llm = openai({ model: MODEL, temperature: 1 })
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "Say 'Hello from LlamaIndex!' in exactly 5 words." },
  ]
  const response = await llm.chat({ messages })
  return String(response.message.content)
}

async function stream() {
  const llm = openai({ model: MODEL, temperature: 1 })
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "Say 'Hello from LlamaIndex stream!' in exactly 6 words." },
  ]
  const chunks: string[] = []
  const stream = await llm.chat({ messages, stream: true })
  for await (const chunk of stream) chunks.push(chunk.delta)
  return chunks.join("")
}

async function toolConversation() {
  const weatherAgent = agent({
    tools: [getWeather],
    llm: openai({ model: MODEL, temperature: 1 }),
    systemPrompt: SYSTEM,
  })
  const result = await weatherAgent.run(
    "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
  )
  return String(result.data.result)
}

async function main() {
  await latitude.ready

  await capture("llamaindex-chat-capture", chat, ctx("chat"))
  await capture("llamaindex-stream-capture", stream, ctx("stream", "stream"))
  await capture("llamaindex-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
