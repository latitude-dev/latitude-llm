/**
 * Vercel AI SDK **v7** — Latitude telemetry example. (For v6, see `test_vercel_ai.ts`.)
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * The v7 betas are wired into this package's devDependencies via npm aliases
 * (`ai7` → `ai@7`, `@ai-sdk/openai7` → `@ai-sdk/openai@4-beta`) so they can live
 * alongside the v6 example. Run with: `pnpm tsx examples/test_vercel_ai_v7.ts`.
 */

import { randomUUID } from "node:crypto"
import { openai } from "@ai-sdk/openai7"
import { OpenTelemetry } from "@ai-sdk/otel"
import { generateText, registerTelemetry, stepCountIs, streamText, tool } from "ai7"
import { z } from "zod"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
})

const PROVIDER = "vercel-ai-v7"
const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model: budget must cover reasoning + the visible answer.
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "vercel-ai-v7-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

const weatherTool = tool({
  description: "Get the current weather for a given city",
  inputSchema: z.object({ city: z.string().describe("The city to get the weather for") }),
  execute: async ({ city }) => ({ city, temperatureC: 21, conditions: "sunny" }),
})

async function chat() {
  const result = await generateText({
    model: openai(MODEL),
    instructions: SYSTEM,
    prompt: "Say 'Hello from Vercel AI SDK v7!' in exactly 7 words.",
    maxOutputTokens: MAX_TOKENS,
  })
  return result.text
}

async function stream() {
  const result = streamText({
    model: openai(MODEL),
    instructions: SYSTEM,
    prompt: "Say 'Hello from Vercel AI SDK v7 stream!' in exactly 8 words.",
    maxOutputTokens: MAX_TOKENS,
  })
  const chunks: string[] = []
  for await (const chunk of result.textStream) chunks.push(chunk)
  return chunks.join("")
}

async function toolConversation() {
  const result = await generateText({
    model: openai(MODEL),
    instructions: SYSTEM,
    prompt: "What's the weather in San Francisco? Use the getWeather tool, then answer in one short sentence.",
    tools: { getWeather: weatherTool },
    stopWhen: stepCountIs(5),
    maxOutputTokens: MAX_TOKENS,
  })
  return result.text
}

async function main() {
  await latitude.ready

  // Must register after Latitude has registered the global tracer provider.
  registerTelemetry(new OpenTelemetry())

  await capture("vercel-ai-v7-chat-capture", chat, ctx("chat"))
  await capture("vercel-ai-v7-stream-capture", stream, ctx("stream", "stream"))
  await capture("vercel-ai-v7-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
}

main().catch(console.error)
