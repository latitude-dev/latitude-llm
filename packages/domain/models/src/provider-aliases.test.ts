import { describe, expect, it } from "vitest"
import { PROVIDER_ALIASES, resolveProviderName } from "./provider-aliases.ts"
import { getModelsForProvider } from "./registry.ts"

describe("PROVIDER_ALIASES drift guard", () => {
  it.each(Object.entries(PROVIDER_ALIASES))("%s resolves to a provider models.dev prices: %s", (_alias, target) => {
    expect(getModelsForProvider(target)).not.toHaveLength(0)
  })

  // Was targeted at `anthropic-vertex`, which models.dev does not have.
  it("prices anthropic_vertex through resolveProviderName", () => {
    expect(resolveProviderName("anthropic_vertex")).toBe("google-vertex-anthropic")
    expect(getModelsForProvider("anthropic_vertex")).not.toHaveLength(0)
  })
})

describe("resolveProviderName", () => {
  it.each([
    ["bedrock", "amazon-bedrock"],
    ["gcp.gen_ai", "google"],
    ["@anthropic-ai/claude-agent-sdk", "anthropic"],
    ["@ai-sdk/fireworks", "fireworks-ai"],
    ["openai-codex", "openai"],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveProviderName(input)).toBe(expected)
  })

  // Folding after the lookup instead of before missed the alias entirely for these.
  it.each([
    ["Amazon_Bedrock", "amazon-bedrock"],
    ["Google", "google"],
    ["@Anthropic-AI/Claude-Agent-SDK", "anthropic"],
  ])("case-folds %s before the lookup", (input, expected) => {
    expect(resolveProviderName(input)).toBe(expected)
  })

  it.each([
    ["openai.chat", "openai"],
    ["anthropic.messages", "anthropic"],
    ["workersai.chat", "cloudflare-workers-ai"],
  ])("strips the Vercel transport suffix from %s", (input, expected) => {
    expect(resolveProviderName(input)).toBe(expected)
  })

  it("passes an unknown provider through so it surfaces under its real name", () => {
    expect(resolveProviderName("@some-vendor/unmapped-sdk")).toBe("@some-vendor/unmapped-sdk")
  })
})
