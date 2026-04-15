import { describe, expect, it } from "vitest"
import { resolveAmazonBedrockModelId } from "./bedrock-nova-inference-model-id.ts"

describe("resolveAmazonBedrockModelId", () => {
  it("prefixes Nova foundation IDs with the geography for the AWS region", () => {
    expect(resolveAmazonBedrockModelId("amazon.nova-lite-v1:0", "eu-central-1")).toBe("eu.amazon.nova-lite-v1:0")
    expect(resolveAmazonBedrockModelId("amazon.nova-lite-v1:0", "us-east-1")).toBe("us.amazon.nova-lite-v1:0")
  })

  it("leaves global inference profile IDs unchanged", () => {
    expect(resolveAmazonBedrockModelId("global.anthropic.claude-opus-4-6-v1", "eu-central-1")).toBe(
      "global.anthropic.claude-opus-4-6-v1",
    )
  })

  it("prefixes Anthropic foundation IDs that require inference profiles", () => {
    expect(resolveAmazonBedrockModelId("anthropic.claude-opus-4-6-v1", "eu-central-1")).toBe(
      "eu.anthropic.claude-opus-4-6-v1",
    )
    expect(resolveAmazonBedrockModelId("anthropic.claude-opus-4-6-v1", "us-east-1")).toBe(
      "us.anthropic.claude-opus-4-6-v1",
    )
    expect(resolveAmazonBedrockModelId("anthropic.claude-sonnet-4-6", "eu-central-1")).toBe(
      "eu.anthropic.claude-sonnet-4-6",
    )
    expect(resolveAmazonBedrockModelId("anthropic.claude-haiku-4-5-20251001-v1:0", "eu-central-1")).toBe(
      "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    )
    expect(resolveAmazonBedrockModelId("anthropic.claude-haiku-4-5-20251001-v1:0", "us-east-1")).toBe(
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    )
  })

  it("does not rewrite already-prefixed Anthropic inference profile IDs", () => {
    expect(resolveAmazonBedrockModelId("us.anthropic.claude-opus-4-6-v1", "eu-central-1")).toBe(
      "us.anthropic.claude-opus-4-6-v1",
    )
  })

  it("passes through other Bedrock model IDs", () => {
    expect(resolveAmazonBedrockModelId("anthropic.claude-sonnet-4-20250514-v1:0", "eu-central-1")).toBe(
      "anthropic.claude-sonnet-4-20250514-v1:0",
    )
  })
})
