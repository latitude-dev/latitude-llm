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
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["anthropic"],
})

async function main() {
  await latitude.ready

  const client = new Anthropic()

  const result = await capture(
    "anthropic-chat",
    async () => {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Say 'Hello from Anthropic!' in exactly 10 words. No ending punctuation.",
          },
        ],
      })

      const content = response.content[0]
      return content?.type === "text" ? content.text : ""
    },
    { tags: ["test", "anthropic"], sessionId: "example" },
  )

  console.log("Anthropic response:", result)
  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
