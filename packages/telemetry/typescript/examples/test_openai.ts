/**
 * Test OpenAI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import OpenAI from 'openai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.OpenAI]: OpenAI,
  },
})

async function testOpenAICompletion() {
  const client = new OpenAI()

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: "Say 'Hello from OpenAI!' in exactly 5 words." },
    ],
    max_tokens: 50,
  })

  return response.choices[0]?.message?.content
}

async function main() {
  console.log('Testing OpenAI instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/openai',
    },
    testOpenAICompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/openai')
}

main().catch(console.error)
