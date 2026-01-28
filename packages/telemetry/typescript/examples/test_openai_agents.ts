/**
 * Test OpenAI Agents instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - OPENAI_API_KEY
 *
 * Install: npm install @openai/agents zod
 */

import * as openaiAgents from '@openai/agents'
import { Agent, OpenAIResponsesModel, Runner, tool } from '@openai/agents'
import OpenAI from 'openai'
import z from 'zod'
import { Instrumentation, LatitudeTelemetry } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.OpenAIAgents]: openaiAgents,
  },
})

const funfact = tool({
  name: 'funfact',
  description: 'Give a fun fact about a historical event',
  parameters: z.object({ event: z.string() }),
  execute: async ({ event }) => {
    if (Math.random() > 0.5) throw new Error('Hah! Gotcha!')
    return `Guess what? ${event} is newer than the birth of the universe`
  },
})

const agent = new Agent({
  name: 'History Tutor',
  instructions:
    'You provide assistance with historical queries. Explain important events and context clearly.',
  tools: [funfact],
})

async function testOpenAIAgent() {
  const client = new OpenAI()

  const runner = new Runner({
    model: new OpenAIResponsesModel(client, 'gpt-5-nano'), // or new OpenAIChatCompletionsModel(client, model)
    traceIncludeSensitiveData: true, // By default is true, but we set it explicitly here for clarity
  })

  const response = await runner.run(
    agent,
    'Talk to me about sharks, and include some fun facts. You must use your tool to get fun facts.',
  )

  return response.finalOutput
}

async function main() {
  console.log('Testing OpenAI Agents instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/openai_agents',
    },
    testOpenAIAgent,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/openai_agents')
}

main().catch(console.error)
