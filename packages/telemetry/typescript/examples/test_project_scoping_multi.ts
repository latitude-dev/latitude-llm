/**
 * Project scoping — multi-project per-capture override — Latitude telemetry example.
 *
 * `new Latitude({ apiKey })` is initialized *without* a default `project`. Every
 * `capture()` declares its own `project` and spans are routed per-capture via the
 * `latitude.project` span attribute. Use this when a single process emits to
 * several Latitude projects (e.g. multiple agents sharing one runtime).
 *
 * Both projects must exist in the org behind `LATITUDE_API_KEY`. The slugs default
 * to `primary` / `secondary`; override via `LATITUDE_PRIMARY_PROJECT_SLUG` /
 * `LATITUDE_SECONDARY_PROJECT_SLUG` to target your own.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - OPENAI_API_KEY
 *
 * Optional env vars:
 * - LATITUDE_PRIMARY_PROJECT_SLUG    (defaults to "primary")
 * - LATITUDE_SECONDARY_PROJECT_SLUG  (defaults to "secondary")
 *
 * Install: npm install openai
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

// No default `project` here — each capture() must declare its own.
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  disableBatch: true,
  instrumentations: { openai: OpenAI },
})

const openai = new OpenAI()

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `project-multi-${randomUUID().slice(0, 8)}`

const PRIMARY_SLUG = process.env.LATITUDE_PRIMARY_PROJECT_SLUG ?? "primary"
const SECONDARY_SLUG = process.env.LATITUDE_SECONDARY_PROJECT_SLUG ?? "secondary"

function ctx(project: string, scenario: string, ...extraTags: string[]) {
  return {
    project,
    tags: ["example", "project-scoping-multi-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, project, environment: "local" },
  }
}

async function fullStackAgent() {
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
    { role: "user", content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence." },
  ]

  const first = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  return second.choices[0]?.message?.content
}

async function callSummariser() {
  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Summarize: 'Customer asked for refund.' in 4 words." },
    ],
    max_completion_tokens: MAX_TOKENS,
  })
  return r.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  // Each capture routes to a DIFFERENT project via its own `project` option.
  console.log(`${PRIMARY_SLUG} →`, await capture("full-stack-agent-run", fullStackAgent, ctx(PRIMARY_SLUG, "tools", "tools", "agent:full-stack")))
  console.log(`${SECONDARY_SLUG} →`, await capture("call-summariser-run", callSummariser, ctx(SECONDARY_SLUG, "chat", "agent:summariser")))

  // A span with neither a per-capture `project` nor a constructor default is rejected at ingest.

  await latitude.flush()
  await latitude.shutdown()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
