/**
 * Test Together AI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - TOGETHER_API_KEY
 *
 * Install: npm install together-ai
 */

import Together from 'together-ai'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.TogetherAI]: Together,
  },
})

async function main() {
  const client = new Together()

  await telemetry.capture(
    { tags: ['test', 'together'], sessionId: 'example' },
    async () => {
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
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
