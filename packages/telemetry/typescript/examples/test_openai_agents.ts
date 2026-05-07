/**
 * Test OpenAI Agents SDK instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install @openai/agents zod
 */

import { Agent, run, tool } from "@openai/agents"
import { z } from "zod"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["openai-agents"],
})

const getWeather = tool({
  name: "get_weather",
  description: "Returns the current weather for a city.",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => `The weather in ${city} is sunny and 22°C.`,
})

async function main() {
  await latitude.ready

  const agent = new Agent({
    name: "Weather agent",
    instructions: "Answer weather questions concisely. Always call get_weather first.",
    tools: [getWeather],
    model: "gpt-4o-mini",
  })

  const output = await capture(
    "weather-agent-run",
    () => run(agent, "What's the weather in Barcelona?"),
    {
      tags: ["typescript", "openai-agents"],
      userId: "Jon",
      sessionId: "example",
      metadata: { env: "local", version: "3.0.0" },
    },
  )

  console.log("Final output:", output.finalOutput)

  await latitude.flush()
  await latitude.shutdown()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
