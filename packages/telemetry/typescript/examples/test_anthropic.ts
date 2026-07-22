/**
 * Anthropic — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - ANTHROPIC_API_KEY
 *
 * Install: npm install @anthropic-ai/sdk
 */

import { randomUUID } from "node:crypto"
import Anthropic, * as AnthropicSDK from "@anthropic-ai/sdk"
import { capture, Latitude } from "../src"
import { createAnthropicInstrumentation } from "../src/instrumentations/anthropic.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createAnthropicInstrumentation(AnthropicSDK)],
})

const PROVIDER = "anthropic"
const MODEL = "claude-opus-4-8"
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

const client = new Anthropic()

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "anthropic-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 50,
    system: SYSTEM,
    messages: [{ role: "user", content: "Say 'Hello from Anthropic!' in exactly 5 words." }],
  })
  const block = response.content[0]
  return block?.type === "text" ? block.text : ""
}

async function stream() {
  const chunks: string[] = []
  const messageStream = client.messages.stream({
    model: MODEL,
    max_tokens: 50,
    system: SYSTEM,
    messages: [{ role: "user", content: "Say 'Hello from Anthropic stream!' in exactly 6 words." }],
  })
  for await (const event of messageStream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      chunks.push(event.delta.text)
    }
  }
  return chunks.join("")
}

async function toolConversation() {
  const tools: AnthropicSDK.Tool[] = [
    {
      name: "get_weather",
      description: "Get the current weather for a city",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ]
  const messages: AnthropicSDK.MessageParam[] = [
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await client.messages.create({ model: MODEL, max_tokens: 200, system: SYSTEM, tools, messages })
  const toolUse = first.content.find((b) => b.type === "tool_use")
  messages.push({ role: "assistant", content: first.content })
  messages.push({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUse!.id,
        content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
      },
    ],
  })

  const second = await client.messages.create({ model: MODEL, max_tokens: 200, system: SYSTEM, tools, messages })
  const block = second.content.find((b) => b.type === "text")
  return block?.type === "text" ? block.text : ""
}

async function main() {
  await latitude.ready

  await capture("anthropic-chat-capture", chat, ctx("chat"))
  await capture("anthropic-stream-capture", stream, ctx("stream", "stream"))
  await capture("anthropic-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
