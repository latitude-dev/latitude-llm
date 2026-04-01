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

import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import * as CallbackManager from '@langchain/core/callbacks/manager'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Langchain]: {
      callbackManagerModule: CallbackManager,
    },
  },
})

async function main() {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    maxTokens: 50,
  })

  await telemetry.capture(
    { tags: ['test', 'langchain'], sessionId: 'example' },
    async () => {
      const messages = [
        new HumanMessage("Say 'Hello from LangChain!' in exactly 5 words."),
      ]

      const response = await model.invoke(messages)
      return response.content
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
