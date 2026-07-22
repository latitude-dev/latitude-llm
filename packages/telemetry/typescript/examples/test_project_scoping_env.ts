/**
 * Project scoping — env-driven default + per-capture override — Latitude telemetry example.
 *
 * Reads the default project slug from `LATITUDE_PROJECT_SLUG` and lets specific
 * captures override it via `capture({ project })`. A common shape for services
 * that run in many environments (staging/prod each have their own project slug)
 * but still need to route a subset of spans elsewhere.
 *
 * Resolution precedence (highest → lowest):
 *   1. `capture({ project })`                      — emits `latitude.project` on the span
 *   2. OTEL resource attribute `latitude.project`  — bare-OTEL setups
 *   3. constructor `project`                       — sent as `X-Latitude-Project` header
 *
 * The override slug (`evaluation-runs` by default) must exist in the same org as
 * `LATITUDE_API_KEY`; override via `LATITUDE_OVERRIDE_PROJECT_SLUG`.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG  (env-driven default for the ctor)
 * - OPENAI_API_KEY
 *
 * Optional env vars:
 * - LATITUDE_OVERRIDE_PROJECT_SLUG  (defaults to "evaluation-runs")
 *
 * Install: npm install openai @traceloop/instrumentation-openai
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

const DEFAULT_SLUG = process.env.LATITUDE_PROJECT_SLUG!
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: DEFAULT_SLUG,
  disableBatch: true,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

const openai = new OpenAI()

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `project-env-${randomUUID().slice(0, 8)}`
const OVERRIDE_SLUG = process.env.LATITUDE_OVERRIDE_PROJECT_SLUG ?? "evaluation-runs"

function ctx(scenario: string, project: string | undefined, ...extraTags: string[]) {
  return {
    ...(project ? { project } : {}),
    tags: ["example", "project-scoping-env-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function defaultRoute() {
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

async function evaluationBatch() {
  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Reply with 'override' in one word." },
    ],
    max_completion_tokens: MAX_TOKENS,
  })
  return r.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  // Inherits the env-driven constructor default — lands in LATITUDE_PROJECT_SLUG.
  console.log(`${DEFAULT_SLUG} →`, await capture("default-route", defaultRoute, ctx("tools", undefined, "tools")))

  // Per-capture override beats the constructor default — routes to OVERRIDE_SLUG regardless of env.
  console.log(`${OVERRIDE_SLUG} →`, await capture("evaluation-batch", evaluationBatch, ctx("override", OVERRIDE_SLUG)))

  await latitude.flush()
  await latitude.shutdown()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
