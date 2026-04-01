/**
 * Test Vertex AI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
 * - GOOGLE_CLOUD_PROJECT
 *
 * Install: npm install @google-cloud/vertexai
 */

import { VertexAI } from "@google-cloud/vertexai"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["vertexai"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: "us-central1",
  })

  const model = vertexAI.getGenerativeModel({
    model: "gemini-1.5-flash",
  })

  await capture(
    "vertex-chat",
    async () => {
      const response = await model.generateContent("Say 'Hello from Vertex!' in exactly 5 words.")

      return response.response.candidates?.[0]?.content?.parts?.[0]?.text || ""
    },
    { tags: ["test", "vertex"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
