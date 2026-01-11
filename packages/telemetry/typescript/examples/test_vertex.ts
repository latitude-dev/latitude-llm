/**
 * Test Vertex AI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
 * - GOOGLE_CLOUD_PROJECT
 *
 * Install: npm install @google-cloud/vertexai
 */

import { VertexAI } from '@google-cloud/vertexai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.VertexAI]: { VertexAI },
  },
})

async function testVertexCompletion() {
  const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: 'us-central1',
  })

  const model = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
  })

  const response = await model.generateContent(
    "Say 'Hello from Vertex!' in exactly 5 words.",
  )

  return response.response.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function main() {
  console.log('Testing Vertex AI instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/vertex',
    },
    testVertexCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/vertex')
}

main().catch(console.error)
