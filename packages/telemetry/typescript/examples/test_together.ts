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

import Together from "together-ai"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["togetherai"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new Together()

  await capture(
    "together-chat",
    async () => {
      const response = await client.chat.completions.create({
        model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
        messages: [
          {
            role: "user",
            content: "Say 'Hello from Together!' in exactly 5 words.",
          },
        ],
        max_tokens: 50,
      })

      return response.choices[0]?.message?.content
    },
    { tags: ["test", "together"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
