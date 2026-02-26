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

async function testOpenAIStreamingCompletion() {
  const client = new OpenAI()
  const stream = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: "Say 'Hello from OpenAI stream!' in exactly 6 words.",
      },
    ],
    max_tokens: 50,
    stream: true,
    stream_options: { include_usage: true },
  })

  const chunks: string[] = []
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (!delta) continue

    process.stdout.write(delta)
    chunks.push(delta)
  }

  process.stdout.write('\n')
  return chunks.join('')
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

  console.log('Testing OpenAI streaming instrumentation...')
  const streamResult = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/openai-stream-ts',
    },
    testOpenAIStreamingCompletion,
  )

  console.log(`Streaming response: ${streamResult}`)
  console.log('Check Latitude dashboard for trace at path: test/openai')
}

main().catch(console.error)
