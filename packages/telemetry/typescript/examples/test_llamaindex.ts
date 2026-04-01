/**
 * Test LlamaIndex instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install llamaindex
 */

import { OpenAI } from 'llamaindex'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.LlamaIndex]: { OpenAI },
  },
})

async function main() {
  const llm = new OpenAI({
    model: 'gpt-4o-mini',
    maxTokens: 50,
  })

  await telemetry.capture(
    { tags: ['test', 'llamaindex'], sessionId: 'example' },
    async () => {
      const response = await llm.complete({
        prompt: "Say 'Hello from LlamaIndex!' in exactly 5 words.",
      })

      return response.text
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
