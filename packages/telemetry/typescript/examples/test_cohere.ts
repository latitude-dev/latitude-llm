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

import { CohereClient } from "cohere-ai"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["cohere"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new CohereClient({
    token: process.env.COHERE_API_KEY,
  })

  await capture(
    "cohere-chat",
    async () => {
      const response = await client.chat({
        model: "command-r",
        message: "Say 'Hello from Cohere!' in exactly 5 words.",
        maxTokens: 50,
      })

      return response.text
    },
    { tags: ["test", "cohere"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
