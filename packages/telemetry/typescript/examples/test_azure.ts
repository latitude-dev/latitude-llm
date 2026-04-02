/**
 * Test Azure OpenAI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT (optional, default: gpt-4o-mini)
 *
 * Install: npm install openai
 */

import { AzureOpenAI } from "openai"
import { capture, initLatitude } from "../src"

// Note: Azure OpenAI uses the same OpenAI instrumentor
const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["openai"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: "2024-02-01",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  })

  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini"

  await capture(
    "azure-chat",
    async () => {
      const response = await client.chat.completions.create({
        model: deploymentName,
        messages: [{ role: "user", content: "Say 'Hello from Azure!' in exactly 5 words." }],
        max_tokens: 50,
      })

      return response.choices[0]?.message?.content
    },
    { tags: ["test", "azure-openai"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
