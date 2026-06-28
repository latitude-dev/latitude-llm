/**
 * OpenRouter — Latitude telemetry QA example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - LATITUDE_TELEMETRY_URL (optional for local QA, e.g. http://localhost:3002)
 * - OPENROUTER_API_KEY
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  serviceName: "openrouter-qa",
  disableBatch: true,
  instrumentations: { openai: OpenAI },
})

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
const SESSION_ID = `openrouter-${randomUUID().slice(0, 8)}`
const SYSTEM = "You are a concise telemetry QA assistant."

function openrouter() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Latitude OpenRouter Telemetry QA",
    },
  })
}

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", "openrouter", "openrouter-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "openrouter-example-user",
    metadata: { scenario, provider: "openrouter", environment: "local" },
  }
}

async function chat() {
  const client = openrouter()
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello from OpenRouter!' in exactly five words." },
    ],
    max_tokens: 120,
  })
  return response.choices[0]?.message?.content
}

async function toolConversation() {
  const client = openrouter()
  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather for a city",
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
    { role: "user", content: "Use get_weather for Paris, then answer in one sentence." },
  ]

  const first = await client.chat.completions.create({ model: MODEL, messages, tools, tool_choice: "auto", max_tokens: 120 })
  const toolCall = first.choices[0]?.message.tool_calls?.[0]
  messages.push(first.choices[0]!.message)

  if (toolCall) {
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({ city: "Paris", temperatureC: 21, condition: "sunny" }),
    })
  }

  const second = await client.chat.completions.create({ model: MODEL, messages, tools, max_tokens: 120 })
  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  console.log("chat →", await capture("openrouter-chat-capture", chat, ctx("chat")))
  console.log("tools →", await capture("openrouter-tools-capture", toolConversation, ctx("tools", "tools")))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
