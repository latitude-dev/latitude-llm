/**
 * Test Anthropic instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - ANTHROPIC_API_KEY
 *
 * Install: npm install @anthropic-ai/sdk
 */

import Anthropic from "@anthropic-ai/sdk"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["anthropic"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new Anthropic()

  await capture(
    "anthropic-chat",
    async () => {
      const response = await client.messages.create({
        model: "claude-3-5-haiku-latest",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Say 'Hello from Anthropic!' in exactly 5 words.",
          },
        ],
      })

      const content = response.content[0]
      return content?.type === "text" ? content.text : ""
    },
    { tags: ["test", "anthropic"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
