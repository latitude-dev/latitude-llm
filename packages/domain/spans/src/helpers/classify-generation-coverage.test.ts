import { describe, expect, it } from "vitest"
import {
  classifyGenerationContent,
  classifyGenerationModelContext,
  classifyGenerationPricing,
} from "./classify-generation-coverage.ts"

describe("classifyGenerationContent", () => {
  it("separates absent content from a budget-skipped payload", () => {
    expect(classifyGenerationContent({ storedBytes: 0, loaded: false })).toBe("absent")
    expect(classifyGenerationContent({ storedBytes: 0, loaded: true })).toBe("absent")
    expect(classifyGenerationContent({ storedBytes: 1_024, loaded: true })).toBe("captured")
    expect(classifyGenerationContent({ storedBytes: 1_024, loaded: false })).toBe("truncated")
  })
})

describe("classifyGenerationPricing", () => {
  const generation = { operation: "chat", provider: "openai", model: "gpt-4o" }

  it("keeps provider-reported and registry-estimated spend distinct", () => {
    expect(classifyGenerationPricing({ ...generation, costSource: "provider_reported" })).toBe("providerReported")
    expect(classifyGenerationPricing({ ...generation, costSource: "estimated" })).toBe("registryEstimated")
  })

  it("treats a non-usage operation and a token-free span as carrying no spend", () => {
    expect(classifyGenerationPricing({ ...generation, operation: "execute_tool", costSource: "estimated" })).toBe(
      "notSpendBearing",
    )
    expect(classifyGenerationPricing({ ...generation, operation: "invoke_agent", costSource: "unpriced" })).toBe(
      "notSpendBearing",
    )
    expect(classifyGenerationPricing({ ...generation, costSource: "no_tokens" })).toBe("notSpendBearing")
  })

  it("keeps a pre-column zero unreadable rather than free", () => {
    expect(classifyGenerationPricing({ ...generation, costSource: "unknown" })).toBe("legacyUnknown")
  })

  it("calls only a local runtime or an explicit free tier a known zero", () => {
    expect(
      classifyGenerationPricing({ operation: "chat", provider: "ollama", model: "llama3", costSource: "unpriced" }),
    ).toBe("knownFree")
    expect(
      classifyGenerationPricing({
        operation: "chat",
        provider: "openrouter",
        model: "deepseek/deepseek-chat:free",
        costSource: "unpriced",
      }),
    ).toBe("knownFree")
  })

  it("does not treat a missing pair or a real pricing gap as free", () => {
    expect(classifyGenerationPricing({ operation: "chat", provider: "", model: "", costSource: "unpriced" })).toBe(
      "unknownPair",
    )
    expect(classifyGenerationPricing({ ...generation, costSource: "unpriced" })).toBe("unpriced")
  })
})

describe("classifyGenerationModelContext", () => {
  it("returns the catalogued context limit for a known pair", () => {
    const context = classifyGenerationModelContext({ provider: "openai", model: "gpt-4o" })

    expect(context.state).toBe("known")
    expect(context.contextLimitTokens ?? 0).toBeGreaterThan(0)
  })

  it("distinguishes a missing pair from a pair the catalog does not size", () => {
    expect(classifyGenerationModelContext({ provider: "", model: "gpt-4o" })).toEqual({
      state: "unknownPair",
      contextLimitTokens: null,
    })
    expect(classifyGenerationModelContext({ provider: "openai", model: "" })).toEqual({
      state: "unknownPair",
      contextLimitTokens: null,
    })
    expect(classifyGenerationModelContext({ provider: "openai", model: "model-that-does-not-exist" })).toEqual({
      state: "unknownContextLimit",
      contextLimitTokens: null,
    })
  })
})
