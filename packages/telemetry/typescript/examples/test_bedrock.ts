/**
 * Test AWS Bedrock instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (default: us-east-1)
 *
 * Install: npm install @aws-sdk/client-bedrock-runtime
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { LatitudeTelemetry, Instrumentation } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
  instrumentations: {
    [Instrumentation.Bedrock]: { BedrockRuntimeClient },
  },
})

async function testBedrockCompletion() {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  })

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: "Say 'Hello from Bedrock!' in exactly 5 words.",
      },
    ],
  })

  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    body: body,
    contentType: 'application/json',
    accept: 'application/json',
  })

  const response = await client.send(command)
  const responseBody = JSON.parse(new TextDecoder().decode(response.body))

  return responseBody.content[0].text
}

async function main() {
  console.log('Testing AWS Bedrock instrumentation...')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/bedrock',
    },
    testBedrockCompletion,
  )

  console.log(`Response: ${result}`)
  console.log('Check Latitude dashboard for trace at path: test/bedrock')
}

main().catch(console.error)
