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

import { OpenAI } from "llamaindex"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["llamaindex"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const llm = new OpenAI({
    model: "gpt-4o-mini",
    maxTokens: 50,
  })

  await capture(
    "llamaindex-chat",
    async () => {
      const response = await llm.complete({
        prompt: "Say 'Hello from LlamaIndex!' in exactly 5 words.",
      })

      return response.text
    },
    { tags: ["test", "llamaindex"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
