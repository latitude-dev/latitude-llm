/**
 * Manual span creation within capture() boundaries — Latitude telemetry example.
 *
 * Verifies that spans created manually with OpenTelemetry's tracer (NOT via an
 * auto-instrumentation) inherit the latitude.* attributes from the surrounding
 * capture() context, pass the smart filter, and nest correctly alongside the
 * auto-instrumented LLM spans + tool calls.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import { randomUUID } from "node:crypto"
import { trace } from "@opentelemetry/api"
import OpenAI from "openai"
import { capture, Latitude } from "../src"
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
  disableBatch: true,
})

const PROVIDER = "openai"
const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model — budget for reasoning + the answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `manual-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "manual-instrumentation-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

const tracer = trace.getTracer("custom.manual.instrumentation")

async function manualSpansWithToolConversation() {
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

  // Manual span (non-LLM): passes the smart filter only because it inherits the capture() latitude.* attrs.
  await tracer.startActiveSpan("pipeline.prepare", async (span) => {
    span.setAttribute("prepare.step", "load_user_context")
    span.setAttribute("prepare.cache_hit", false)
    await new Promise((resolve) => setTimeout(resolve, 50))
    span.end()
  })

  const first = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    max_completion_tokens: MAX_TOKENS,
  })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)

  // Manual tool-execution span via the OTEL GenAI semconv: gen_ai.operation.name=execute_tool
  // classifies it; gen_ai.tool.call.id ties it to the LLM's tool_call.
  const args = JSON.parse(toolCall!.function.arguments) as { city: string }
  const toolResult = await tracer.startActiveSpan(`execute_tool ${toolCall!.function.name}`, async (span) => {
    span.setAttribute("gen_ai.operation.name", "execute_tool")
    span.setAttribute("gen_ai.tool.name", toolCall!.function.name)
    span.setAttribute("gen_ai.tool.call.id", toolCall!.id)
    span.setAttribute("gen_ai.tool.call.arguments", toolCall!.function.arguments)

    const result = { city: args.city, temperatureC: 21, conditions: "sunny" }

    span.setAttribute("gen_ai.tool.call.result", JSON.stringify(result))
    span.end()
    return result
  })

  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify(toolResult),
  })

  const second = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    max_completion_tokens: MAX_TOKENS,
  })

  // Manual span: non-LLM work AFTER the model call.
  await tracer.startActiveSpan("pipeline.format", async (span) => {
    span.setAttribute("format.type", "markdown")
    span.setAttribute("format.includes_citations", false)
    span.end()
  })

  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  const result = await capture("manual-instrumentation-tools", manualSpansWithToolConversation, ctx("tools", "tools"))
  console.log(`Result: ${result}`)
  console.log("Expected spans: pipeline.prepare, execute_tool get_weather, pipeline.format + 2 openai LLM spans")

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
