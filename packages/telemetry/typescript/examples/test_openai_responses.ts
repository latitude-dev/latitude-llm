/**
 * Test OpenAI Responses API against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["openai"],
})

async function main() {
  await latitude.ready

  const client = new OpenAI()

  await capture(
    "openai-responses",
    async () => {
      const response = await client.responses.create({
        model: "gpt-4o-mini",
        input: "Say 'Hello from OpenAI Responses!' in exactly 5 words.",
        max_output_tokens: 50,
      })

      return response.output_text
    },
    { tags: ["test", "openai", "responses"], userId: "Jon", sessionId: "example" },
  )

  await capture(
    "openai-responses-stream",
    async () => {
      const stream = await client.responses.create({
        model: "gpt-4o-mini",
        input: "Say 'Hello from OpenAI Responses stream!' in exactly 6 words.",
        max_output_tokens: 50,
        stream: true,
      })

      const chunks: string[] = []
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          chunks.push(event.delta)
        }
      }

      return chunks.join("")
    },
    { tags: ["test", "openai", "responses", "stream"], userId: "Jon", sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
