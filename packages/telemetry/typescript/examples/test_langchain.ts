/**
 * LangChain — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install @langchain/openai @langchain/core zod
 */

import { randomUUID } from "node:crypto"
import { type BaseMessage, HumanMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { ChatOpenAI } from "@langchain/openai"
import * as LangChain from "@langchain/core"
import { z } from "zod"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { langchain: LangChain },
})

const PROVIDER = "langchain"
const MODEL = "gpt-4o-mini"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

const getWeather = tool(async ({ city }) => JSON.stringify({ city, temperatureC: 21, conditions: "sunny" }), {
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({ city: z.string() }),
})

async function chat() {
  const model = new ChatOpenAI({ modelName: MODEL, maxTokens: 50 })
  const response = await model.invoke([new HumanMessage("Say 'Hello from LangChain!' in exactly 5 words.")])
  return response.content
}

async function stream() {
  const model = new ChatOpenAI({ modelName: MODEL, maxTokens: 50 })
  const chunks: string[] = []
  for await (const chunk of await model.stream([
    new HumanMessage("Say 'Hello from LangChain stream!' in exactly 6 words."),
  ])) {
    if (typeof chunk.content === "string") chunks.push(chunk.content)
  }
  return chunks.join("")
}

async function toolConversation() {
  const model = new ChatOpenAI({ modelName: MODEL, maxTokens: 200 }).bindTools([getWeather])
  const messages: BaseMessage[] = [
    new HumanMessage("What's the weather in San Francisco? Use get_weather, then answer in one short sentence."),
  ]

  const first = await model.invoke(messages)
  messages.push(first)
  for (const toolCall of first.tool_calls ?? []) {
    messages.push(await getWeather.invoke(toolCall))
  }

  const second = await model.invoke(messages)
  return second.content
}

async function main() {
  await latitude.ready

  await toolConversation()

  await capture("langchain-chat-capture", chat, ctx("chat"))
  await capture("langchain-stream-capture", stream, ctx("stream", "stream"))
  await capture("langchain-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
