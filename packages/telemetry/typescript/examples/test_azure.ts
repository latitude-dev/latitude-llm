/**
 * Azure OpenAI — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT (optional, default: gpt-4o-mini)
 *
 * Install: npm install openai
 */

import { randomUUID } from "node:crypto"
import { AzureOpenAI, OpenAI } from "openai"
import { capture, Latitude } from "../src"
import { createOpenAIInstrumentation } from "../src/instrumentations/openai.ts"

// Note: Azure OpenAI uses the same OpenAI instrumentor
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

const PROVIDER = "azure"
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

function client() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: "2024-02-01",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  })
}

async function chat() {
  const response = await client().chat.completions.create({
    model: DEPLOYMENT,
    messages: [{ role: "user", content: "Say 'Hello from Azure!' in exactly 5 words." }],
    max_tokens: 50,
  })
  return response.choices[0]?.message?.content
}

async function toolConversation() {
  const azure = client()
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
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await azure.chat.completions.create({ model: DEPLOYMENT, messages, tools, max_tokens: 200 })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await azure.chat.completions.create({ model: DEPLOYMENT, messages, tools, max_tokens: 200 })
  return second.choices[0]?.message?.content
}

async function main() {
  await latitude.ready

  await toolConversation()

  await capture("azure-chat-capture", chat, ctx("chat"))
  await capture("azure-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
