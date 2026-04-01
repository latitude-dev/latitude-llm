/**
 * Test Cohere instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - COHERE_API_KEY
 *
 * Install: npm install cohere-ai
 */

import { CohereClient } from 'cohere-ai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Cohere]: { CohereClient },
  },
})

async function main() {
  const client = new CohereClient({
    token: process.env.COHERE_API_KEY,
  })

  await telemetry.capture(
    { tags: ['test', 'cohere'], sessionId: 'example' },
    async () => {
      const response = await client.chat({
        model: 'command-r',
        message: "Say 'Hello from Cohere!' in exactly 5 words.",
        maxTokens: 50,
      })

      return response.text
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
