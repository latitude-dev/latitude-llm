/**
 * OpenAI — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { openai: OpenAI },
})

const PROVIDER = "openai"
const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model: budget must cover reasoning + the visible answer (else finish_reason "length").
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "openai-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const client = new OpenAI()
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello from OpenAI!' in exactly 5 words." },
    ],
    max_completion_tokens: MAX_TOKENS,
  })
  return response.choices[0]?.message?.content
}

async function stream() {
  const client = new OpenAI()
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello from OpenAI stream!' in exactly 6 words." },
    ],
    max_completion_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
  })

  const chunks: string[] = []
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) chunks.push(delta)
  }
  return chunks.join("")
}

async function toolConversation() {
  const client = new OpenAI()
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
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await client.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await client.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  await capture("openai-chat-capture", chat, ctx("chat"))
  await capture("openai-stream-capture", stream, ctx("stream", "stream"))
  await capture("openai-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
