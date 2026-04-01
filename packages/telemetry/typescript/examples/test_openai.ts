/**
 * Test OpenAI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import OpenAI from "openai"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["openai"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new OpenAI()

  await capture(
    "openai-chat",
    async () => {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'Hello from OpenAI!' in exactly 5 words." }],
        max_tokens: 50,
      })

      return response.choices[0]?.message?.content
    },
    { tags: ["test", "openai"], userId: "Jon", sessionId: "example", metadata: { env: "local", version: "3.0.0" } },
  )

  await capture(
    "openai-stream",
    async () => {
      const stream = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
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
        if (delta) chunks.push(delta)
      }

      return chunks.join("")
    },
    { tags: ["test", "openai", "stream"], userId: "Jon", sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
