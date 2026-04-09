import { AICredentialError } from "@domain/ai"
import { Effect, Result } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createProviderModel } from "./ai.ts"

const originalAwsRegion = process.env.LAT_AWS_REGION
const originalAwsAccessKeyId = process.env.LAT_AWS_ACCESS_KEY_ID
const originalAwsSecretAccessKey = process.env.LAT_AWS_SECRET_ACCESS_KEY
const originalAnthropicApiKey = process.env.LAT_ANTHROPIC_API_KEY
const originalOpenAiApiKey = process.env.LAT_OPENAI_API_KEY

beforeEach(() => {
  process.env.LAT_AWS_REGION = "us-east-1"
  process.env.LAT_AWS_ACCESS_KEY_ID = "test-access-key"
  process.env.LAT_AWS_SECRET_ACCESS_KEY = "test-secret-key"
  process.env.LAT_ANTHROPIC_API_KEY = "sk-ant-test"
  process.env.LAT_OPENAI_API_KEY = "sk-openai-test"
})

afterEach(() => {
  process.env.LAT_AWS_REGION = originalAwsRegion
  process.env.LAT_AWS_ACCESS_KEY_ID = originalAwsAccessKeyId
  process.env.LAT_AWS_SECRET_ACCESS_KEY = originalAwsSecretAccessKey
  process.env.LAT_ANTHROPIC_API_KEY = originalAnthropicApiKey
  process.env.LAT_OPENAI_API_KEY = originalOpenAiApiKey
})

describe("createProviderModel", () => {
  it("fails with AICredentialError on the Effect channel for unsupported providers", async () => {
    const outcome = await Effect.runPromise(
      Effect.result(createProviderModel("unknown-provider", "anthropic.claude-sonnet-4-20250514-v1:0")),
    )

    expect(Result.isFailure(outcome)).toBe(true)
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(AICredentialError)
      expect(outcome.failure.provider).toBe("unknown-provider")
      expect(outcome.failure.statusCode).toBe(400)
    }
  })

  it("succeeds with a language model for Bedrock", async () => {
    const model = await Effect.runPromise(
      createProviderModel("amazon-bedrock", "anthropic.claude-sonnet-4-20250514-v1:0"),
    )

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })

  it("succeeds with a language model for anthropic", async () => {
    const model = await Effect.runPromise(createProviderModel("anthropic", "claude-3-5-sonnet-20241022"))

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })

  it("succeeds with a language model for openai", async () => {
    const model = await Effect.runPromise(createProviderModel("openai", "gpt-4o"))

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })
})
