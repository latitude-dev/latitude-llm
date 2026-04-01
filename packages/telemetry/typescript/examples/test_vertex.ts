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

import { VertexAI } from '@google-cloud/vertexai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.VertexAI]: { VertexAI },
  },
})

async function main() {
  const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: 'us-central1',
  })

  const model = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
  })

  await telemetry.capture(
    { tags: ['test', 'vertex'], sessionId: 'example' },
    async () => {
      const response = await model.generateContent(
        "Say 'Hello from Vertex!' in exactly 5 words.",
      )

      return response.response.candidates?.[0]?.content?.parts?.[0]?.text || ''
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
