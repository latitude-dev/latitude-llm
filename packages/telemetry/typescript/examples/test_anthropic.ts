/**
 * Test Anthropic instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - ANTHROPIC_API_KEY
 *
 * Install: npm install @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Anthropic]: Anthropic,
  },
})

async function testAnthropicCompletion() {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: "Say 'Hello from Anthropic!' in exactly 5 words.",
      },
    ],
  })

  const content = response.content[0]
  return content?.type === 'text' ? content.text : ''
}

async function main() {
  console.log('Testing Anthropic instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/anthropic',
    },
    testAnthropicCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/anthropic')
}

main().catch(console.error)
