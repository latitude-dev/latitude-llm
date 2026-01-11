/**
 * Test Azure OpenAI instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT (optional, default: gpt-4o-mini)
 *
 * Install: npm install openai
 */

import { AzureOpenAI } from 'openai'
import { LatitudeTelemetry, Instrumentation } from '../src'

// Note: Azure OpenAI uses the same OpenAI instrumentor
const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.OpenAI]: { AzureOpenAI },
  },
})

async function testAzureCompletion() {
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: '2024-02-01',
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  })

  const deploymentName =
    process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini'

  const response = await client.chat.completions.create({
    model: deploymentName,
    messages: [
      { role: 'user', content: "Say 'Hello from Azure!' in exactly 5 words." },
    ],
    max_tokens: 50,
  })

  return response.choices[0]?.message?.content
}

async function main() {
  console.log('Testing Azure OpenAI instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/azure-openai',
    },
    testAzureCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/azure-openai')
}

main().catch(console.error)
