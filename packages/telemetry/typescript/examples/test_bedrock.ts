/**
 * Test AWS Bedrock instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (default: us-east-1)
 *
 * Install: npm install @aws-sdk/client-bedrock-runtime
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { capture, initLatitude } from "../src"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["bedrock"],
})

async function main() {
  // Wait for instrumentations to be ready
  await latitude.ready

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  })

  await capture(
    "bedrock-chat",
    async () => {
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Say 'Hello from Bedrock!' in exactly 5 words.",
          },
        ],
      })

      const command = new InvokeModelCommand({
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        body: body,
        contentType: "application/json",
        accept: "application/json",
      })

      const response = await client.send(command)
      const responseBody = JSON.parse(new TextDecoder().decode(response.body))

      return responseBody.content[0].text
    },
    { tags: ["test", "bedrock"], sessionId: "example" },
  )

  await latitude.flush()
}

main().catch(console.error)
