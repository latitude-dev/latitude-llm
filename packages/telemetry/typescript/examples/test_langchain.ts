/**
 * Test LangChain instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - OPENAI_API_KEY
 *
 * Install: npm install langchain @langchain/openai @langchain/core
 */

import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import * as CallbackManager from '@langchain/core/callbacks/manager'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Langchain]: {
      callbackManagerModule: CallbackManager,
    },
  },
})

async function testLangchainCompletion() {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    maxTokens: 50,
  })

  const messages = [
    new HumanMessage("Say 'Hello from LangChain!' in exactly 5 words."),
  ]

  const response = await model.invoke(messages)

  return response.content
}

async function main() {
  console.log('Testing LangChain instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/langchain',
    },
    testLangchainCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/langchain')
}

main().catch(console.error)
