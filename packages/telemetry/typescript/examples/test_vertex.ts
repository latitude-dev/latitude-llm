/**
 * Vertex AI — Latitude telemetry example.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
 * - GOOGLE_CLOUD_PROJECT
 *
 * Install: npm install @google-cloud/vertexai
 */

import { randomUUID } from "node:crypto"
import * as VertexAISDK from "@google-cloud/vertexai"
import { VertexAI } from "@google-cloud/vertexai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: { vertexai: VertexAISDK },
})

const PROVIDER = "vertexai"
const MODEL = "gemini-1.5-flash"
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
  const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: "us-central1",
  })

  const model = vertexAI.getGenerativeModel({
    model: MODEL,
  })

  const response = await model.generateContent("Say 'Hello from Vertex!' in exactly 5 words.")

  return response.response.candidates?.[0]?.content?.parts?.[0]?.text || ""
}

async function main() {
  await latitude.ready

  await chat()

  await capture("vertexai-chat-capture", chat, ctx("chat"))

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
