/**
 * AWS Bedrock — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - AWS credentials via the default chain (env vars, shared config, SSO, instance role…)
 * - AWS_REGION (default: eu-central-1)
 *
 * Install: npm install @aws-sdk/client-bedrock-runtime
 */

import { randomUUID } from "node:crypto"
import * as BedrockSDK from "@aws-sdk/client-bedrock-runtime"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { bedrock: BedrockSDK },
})

const PROVIDER = "bedrock"
// Cross-region inference profile id; the instrumentation strips the `eu.` prefix to detect the vendor.
const MODEL = "eu.anthropic.claude-opus-4-8"
const REGION = process.env.AWS_REGION || "eu-central-1"
const ANTHROPIC_VERSION = "bedrock-2023-05-31"
const MAX_TOKENS = 1024
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

type ContentBlock = { type: string; [key: string]: unknown }
type Message = { role: "user" | "assistant"; content: string | ContentBlock[] }

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, "bedrock-ts", ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

function client() {
  return new BedrockRuntimeClient({ region: REGION })
}

async function invoke(body: Record<string, unknown>) {
  const response = await client().send(
    new InvokeModelCommand({
      modelId: MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    }),
  )
  return JSON.parse(new TextDecoder().decode(response.body)) as { content: ContentBlock[] }
}

async function chat() {
  const res = await invoke({
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: "Say 'Hello from Bedrock!' in exactly 5 words." }],
  })
  return res.content.find((b) => b.type === "text")?.text
}

async function stream() {
  const response = await client().send(
    new InvokeModelWithResponseStreamCommand({
      modelId: MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: ANTHROPIC_VERSION,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: "Say 'Hello from Bedrock stream!' in exactly 6 words." }],
      }),
    }),
  )

  const chunks: string[] = []
  for await (const event of response.body ?? []) {
    const bytes = event.chunk?.bytes
    if (!bytes) continue
    const evt = JSON.parse(new TextDecoder().decode(bytes))
    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
      chunks.push(evt.delta.text)
    }
  }
  return chunks.join("")
}

async function toolConversation() {
  const tools = [
    {
      name: "get_weather",
      description: "Get the current weather for a city",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ]

  const messages: Message[] = [
    {
      role: "user",
      content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
    },
  ]

  const first = await invoke({ anthropic_version: ANTHROPIC_VERSION, max_tokens: MAX_TOKENS, system: SYSTEM, tools, messages })
  const toolUse = first.content.find((b) => b.type === "tool_use")
  messages.push({ role: "assistant", content: first.content })
  messages.push({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUse!.id as string,
        content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
      },
    ],
  })

  const second = await invoke({ anthropic_version: ANTHROPIC_VERSION, max_tokens: MAX_TOKENS, system: SYSTEM, tools, messages })
  return second.content.find((b) => b.type === "text")?.text
}

async function main() {
  await latitude.ready

  await capture("bedrock-chat-capture", chat, ctx("chat"))
  await capture("bedrock-stream-capture", stream, ctx("stream", "stream"))
  await capture("bedrock-tools-capture", toolConversation, ctx("tools", "tools"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
