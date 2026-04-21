import { AICredentialError } from "@domain/ai"
import { Effect, Result } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { bedrockModelFactoryMock, createAmazonBedrockMock, fromNodeProviderChainMock } = vi.hoisted(() => {
  const bedrockModelFactoryMock = vi.fn((modelId: string) => ({ modelId }))

  return {
    bedrockModelFactoryMock,
    createAmazonBedrockMock: vi.fn(() => bedrockModelFactoryMock),
    fromNodeProviderChainMock: vi.fn(() =>
      Promise.resolve({
        accessKeyId: "provider-chain-access-key",
        secretAccessKey: "provider-chain-secret-key",
      }),
    ),
  }
})

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: createAmazonBedrockMock,
}))

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: fromNodeProviderChainMock,
}))

import { createProviderModel } from "./ai.ts"

const originalAwsRegion = process.env.LAT_AWS_REGION
const originalAwsAccessKeyId = process.env.LAT_AWS_ACCESS_KEY_ID
const originalAwsSecretAccessKey = process.env.LAT_AWS_SECRET_ACCESS_KEY
const originalAwsSessionToken = process.env.LAT_AWS_SESSION_TOKEN
const originalAwsBearerTokenBedrock = process.env.LAT_AWS_BEARER_TOKEN_BEDROCK

beforeEach(() => {
  process.env.LAT_AWS_REGION = "us-east-1"
  process.env.LAT_AWS_ACCESS_KEY_ID = "test-access-key"
  process.env.LAT_AWS_SECRET_ACCESS_KEY = "test-secret-key"
  delete process.env.LAT_AWS_SESSION_TOKEN
  delete process.env.LAT_AWS_BEARER_TOKEN_BEDROCK
  bedrockModelFactoryMock.mockClear()
  createAmazonBedrockMock.mockClear()
  fromNodeProviderChainMock.mockClear()
})

afterEach(() => {
  process.env.LAT_AWS_REGION = originalAwsRegion
  process.env.LAT_AWS_ACCESS_KEY_ID = originalAwsAccessKeyId
  process.env.LAT_AWS_SECRET_ACCESS_KEY = originalAwsSecretAccessKey
  process.env.LAT_AWS_SESSION_TOKEN = originalAwsSessionToken
  process.env.LAT_AWS_BEARER_TOKEN_BEDROCK = originalAwsBearerTokenBedrock
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
    expect(createAmazonBedrockMock).toHaveBeenCalledTimes(1)
    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("us.anthropic.claude-sonnet-4-20250514-v1:0")
    expect(fromNodeProviderChainMock).not.toHaveBeenCalled()
  })

  it("uses the AWS SDK credential provider chain for Bedrock when explicit credentials are absent", async () => {
    delete process.env.LAT_AWS_ACCESS_KEY_ID
    delete process.env.LAT_AWS_SECRET_ACCESS_KEY
    delete process.env.LAT_AWS_SESSION_TOKEN

    const model = await Effect.runPromise(
      createProviderModel("amazon-bedrock", "anthropic.claude-sonnet-4-20250514-v1:0"),
    )

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("us.anthropic.claude-sonnet-4-20250514-v1:0")
    expect(fromNodeProviderChainMock).toHaveBeenCalledTimes(1)
  })

  it("rewrites already-scoped Bedrock model IDs to the configured AWS geography", async () => {
    process.env.LAT_AWS_REGION = "eu-central-1"

    await Effect.runPromise(createProviderModel("amazon-bedrock", "us.amazon.nova-lite-v1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("eu.amazon.nova-lite-v1:0")
  })

  it("preserves global Bedrock model IDs", async () => {
    await Effect.runPromise(createProviderModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-20250514-v1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("global.anthropic.claude-sonnet-4-20250514-v1:0")
  })

  it("passes foundation-only Bedrock model IDs through without a geography prefix", async () => {
    // MiniMax on Bedrock ships as a raw foundation model; wrapping it with
    // `us.`, `eu.`, or `apac.` yields an identifier AWS rejects.
    await Effect.runPromise(createProviderModel("amazon-bedrock", "minimax.minimax-m2.5"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("minimax.minimax-m2.5")
  })

  it("strips a bogus geography prefix from foundation-only Bedrock model IDs", async () => {
    await Effect.runPromise(createProviderModel("amazon-bedrock", "us.minimax.minimax-m2.5"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("minimax.minimax-m2.5")
  })
})
