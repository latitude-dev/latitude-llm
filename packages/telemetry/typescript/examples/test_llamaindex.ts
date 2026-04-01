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

async function testLlamaIndexCompletion() {
  const llm = new OpenAI({
    model: 'gpt-4o-mini',
    maxTokens: 50,
  })

  const response = await llm.complete({
    prompt: "Say 'Hello from LlamaIndex!' in exactly 5 words.",
  })

  return response.text
}

async function main() {
  console.log('Testing LlamaIndex instrumentation...')

  const result = await telemetry.capture(
    { tags: ['test', 'llamaindex'], sessionId: 'example' },
    testLlamaIndexCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/llamaindex')
}

main().catch(console.error)
