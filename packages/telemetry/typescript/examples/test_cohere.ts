/**
 * Test Cohere instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - COHERE_API_KEY
 *
 * Install: npm install cohere-ai
 */

import { CohereClient } from 'cohere-ai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Cohere]: { CohereClient },
  },
})

async function testCohereCompletion() {
  const client = new CohereClient({
    token: process.env.COHERE_API_KEY,
  })

  const response = await client.chat({
    model: 'command-r',
    message: "Say 'Hello from Cohere!' in exactly 5 words.",
    maxTokens: 50,
  })

  return response.text
}

async function main() {
  console.log('Testing Cohere instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/cohere',
    },
    testCohereCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/cohere')
}

main().catch(console.error)
