/**
 * Test LangChain instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install langchain @langchain/openai @langchain/core
 */

import { HumanMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["langchain"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    maxTokens: 50,
  })

  await capture(
    "langchain-chat",
    async () => {
      const messages = [new HumanMessage("Say 'Hello from LangChain!' in exactly 5 words.")]

      const response = await model.invoke(messages)
      return response.content
    },
    { tags: ["test", "langchain"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
