/**
 * OpenAI Agents SDK — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install @openai/agents zod
 */

import { randomUUID } from "node:crypto"
import * as OpenAIAgentsSDK from "@openai/agents"
import { Agent, run, tool } from "@openai/agents"
import { z } from "zod"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { "openai-agents": OpenAIAgentsSDK },
})

const PROVIDER = "openai-agents"
const MODEL = "gpt-5.5"
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "openai-agents-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

const getWeather = tool({
  name: "get_weather",
  description: "Get the current weather for a city.",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => `The weather in ${city} is sunny and 21°C.`,
})

async function chat() {
  const agent = new Agent({ name: "Greeter", instructions: SYSTEM, model: MODEL })
  const result = await run(agent, "Say 'Hello from OpenAI Agents!' in exactly 5 words.")
  return result.finalOutput
}

async function toolConversation() {
  const agent = new Agent({
    name: "Weather agent",
    instructions: `${SYSTEM} Always call get_weather first.`,
    tools: [getWeather],
    model: MODEL,
  })
  const result = await run(
    agent,
    "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
  )
  return result.finalOutput
}

async function main() {
  await latitude.ready

  await capture("openai-agents-chat-capture", chat, ctx("chat"))
  await capture("openai-agents-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
