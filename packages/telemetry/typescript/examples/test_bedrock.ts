/**
 * AWS Bedrock — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (default: us-east-1)
 *
 * Install: npm install @aws-sdk/client-bedrock-runtime
 */

import { randomUUID } from "node:crypto"
import * as BedrockSDK from "@aws-sdk/client-bedrock-runtime"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { bedrock: BedrockSDK },
})

const PROVIDER = "bedrock"
const MODEL = "anthropic.claude-3-haiku-20240307-v1:0"
const SESSION_ID = `${PROVIDER}-${randomUUID().slice(0, 8)}`

function ctx(scenario: string, ...extraTags: string[]) {
  return {
    tags: ["example", PROVIDER, ...extraTags],
    sessionId: SESSION_ID,
    userId: "example-user",
    metadata: { scenario, environment: "local" },
  }
}

async function chat() {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  })

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: "Say 'Hello from Bedrock!' in exactly 5 words.",
      },
    ],
  })

  const command = new InvokeModelCommand({
    modelId: MODEL,
    body: body,
    contentType: "application/json",
    accept: "application/json",
  })

  const response = await client.send(command)
  const responseBody = JSON.parse(new TextDecoder().decode(response.body))

  return responseBody.content[0].text
}

async function main() {
  await latitude.ready

  await chat()

  await capture("bedrock-chat-capture", chat, ctx("chat"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
