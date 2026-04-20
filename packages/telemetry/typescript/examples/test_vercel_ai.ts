/**
 * Test Vercel AI SDK instrumentation against local Latitude instance.
 *
 * This example shows both patterns:
 * - a generation wrapped in `capture()` for Latitude context tags/metadata
 * - a generation without `capture()` using only AI SDK telemetry + a Latitude tracer
 *
 * No Latitude auto-instrumentation is required.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install ai @ai-sdk/openai
 */

import { openai } from "@ai-sdk/openai"
import { generateText, streamText } from "ai"
import { capture, initLatitude } from "../src"

const apiKey = process.env.LATITUDE_API_KEY
const projectSlug = process.env.LATITUDE_PROJECT_SLUG

if (!apiKey) {
  throw new Error("LATITUDE_API_KEY is required")
}

if (!projectSlug) {
  throw new Error("LATITUDE_PROJECT_SLUG is required")
}

const latitude = initLatitude({
  apiKey,
  projectSlug,
  disableBatch: true,
})

async function main() {
  await latitude.ready

  console.log("Wrapped with capture():")
  const generatedText = await capture(
    "vercel-ai-generate-text",
    async () => {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        prompt: "Say 'Hello from Vercel AI SDK!' in exactly 6 words.",
        maxOutputTokens: 50,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            provider: "openai",
            sdk: "vercel-ai",
          },
        },
      })

      return result.text
    },
    {
      tags: ["test", "vercel-ai"],
      userId: "Jon",
      sessionId: "example",
      metadata: { env: "local", version: "3.0.0" },
    },
  )

  console.log(generatedText)

  console.log("\nWithout capture() wrapper:")
  const streamedResult = streamText({
    model: openai("gpt-4o-mini"),
    prompt: "Say 'Hello from Vercel AI SDK stream!' in exactly 7 words.",
    maxOutputTokens: 50,
    experimental_telemetry: {
      isEnabled: true,
      metadata: {
        provider: "openai",
        sdk: "vercel-ai",
        mode: "stream",
      },
    },
  })

  const chunks: string[] = []
  for await (const chunk of streamedResult.textStream) {
    chunks.push(chunk)
  }

  console.log(chunks.join(""))

  await latitude.flush()
}

main().catch(console.error)
