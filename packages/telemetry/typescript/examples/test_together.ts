/**
 * Together AI — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install together-ai
 *
 * No Together key on hand, so we point the (OpenAI-wire-compatible) together-ai SDK at OpenAI's
 * endpoint with an OpenAI model. This still exercises the real @traceloop/instrumentation-together
 * + Latitude's parse/display; only gen_ai.system / model won't reflect a real Together backend.
 */

import { randomUUID } from "node:crypto"
import Together from "together-ai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  // The Traceloop instrumentor patches Together.Chat.Completions / Together.Completions — pass the
  // client class, not the module namespace (which has no Chat/Completions statics).
  instrumentations: { togetherai: Together },
})

const PROVIDER = "togetherai"
const MODEL = "gpt-5.5"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function client() {
  return new Together({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1" })
}

const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "togetherai-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const response = await client().chat.completions.create({
    model: MODEL,
    temperature: 1,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello from Together!' in exactly 5 words." },
    ],
  })
  return response.choices[0]?.message?.content
}

async function stream() {
  const stream = await client().chat.completions.create({
    model: MODEL,
    temperature: 1,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello from Together stream!' in exactly 6 words." },
    ],
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
  const messages: Together.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await client().chat.completions.create({ model: MODEL, temperature: 1, messages, tools })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await client().chat.completions.create({ model: MODEL, temperature: 1, messages, tools })
  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  await capture("togetherai-chat-capture", chat, ctx("chat"))
  await capture("togetherai-stream-capture", stream, ctx("stream", "stream"))
  await capture("togetherai-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
