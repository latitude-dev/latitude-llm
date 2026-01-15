/**
 * Test Together AI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - TOGETHER_API_KEY
 *
 * Install: npm install together-ai
 */

import Together from 'together-ai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.TogetherAI]: Together,
  },
})

async function testTogetherCompletion() {
  const client = new Together()

  const response = await client.chat.completions.create({
    model: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
    messages: [
      {
        role: 'user',
        content: "Say 'Hello from Together!' in exactly 5 words.",
      },
    ],
    max_tokens: 50,
  })

  return response.choices[0]?.message?.content
}

async function main() {
  console.log('Testing Together AI instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/together',
    },
    testTogetherCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/together')
}

main().catch(console.error)
