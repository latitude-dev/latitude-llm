/**
 * Vercel AI SDK **v6** — Latitude telemetry example. (For v7, see `test_vercel_ai_v7.ts`.)
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install ai @ai-sdk/openai zod
 */

import { randomUUID } from "node:crypto"
import { openai } from "@ai-sdk/openai"
import { generateText, stepCountIs, streamText, tool } from "ai"
import { z } from "zod"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
})

const PROVIDER = "vercel-ai"
const MODEL = "gpt-4o-mini"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`
const telemetry = { isEnabled: true }

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, ...extraTags],
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
    prompt: "Say 'Hello from Vercel AI SDK!' in exactly 6 words.",
    maxOutputTokens: 50,
    experimental_telemetry: telemetry,
  })
  return result.text
}

async function stream() {
  const result = streamText({
    model: openai(MODEL),
    prompt: "Say 'Hello from Vercel AI SDK stream!' in exactly 7 words.",
    maxOutputTokens: 50,
    experimental_telemetry: telemetry,
  })
  const chunks: string[] = []
  for await (const chunk of result.textStream) chunks.push(chunk)
  return chunks.join("")
}

async function toolConversation() {
  const result = await generateText({
    model: openai(MODEL),
    prompt: "What's the weather in San Francisco? Use the getWeather tool, then answer in one short sentence.",
    tools: { getWeather: weatherTool },
    stopWhen: stepCountIs(5),
    maxOutputTokens: 200,
    experimental_telemetry: telemetry,
  })
  return result.text
}

async function main() {
  await latitude.ready

  await toolConversation()

  await capture("vercel-ai-chat-capture", chat, ctx("chat"))
  await capture("vercel-ai-stream-capture", stream, ctx("stream", "stream"))
  await capture("vercel-ai-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
}

main().catch(console.error)
