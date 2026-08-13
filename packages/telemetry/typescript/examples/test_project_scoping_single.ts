/**
 * Project scoping — single-project default — Latitude telemetry example.
 *
 * `new Latitude({ apiKey, project })` sets a default project for every span
 * (sent as the `X-Latitude-Project` header). `capture()` inherits it, so all
 * spans land in the same Latitude project. This is the recommended setup for
 * processes that emit to one project.
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
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

const openai = new OpenAI()

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `project-single-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", "project-scoping-single-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function greet() {
  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Say 'Hello!' in exactly 2 words." },
    ],
    max_completion_tokens: MAX_TOKENS,
  })
  return r.choices[0]?.message?.content
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
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    max_completion_tokens: MAX_TOKENS,
  })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    max_completion_tokens: MAX_TOKENS,
  })
  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  // Both captures inherit the constructor's default `project` — no per-call project given.
  console.log("greet →", await capture("greet", greet, ctx("greet")))
  console.log("tools →", await capture("summarize-weather", toolConversation, ctx("tools", "tools")))

  await latitude.flush()
  await latitude.shutdown()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
