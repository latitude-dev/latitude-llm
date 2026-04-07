import { AICredentialError } from "@domain/ai"
import { Effect, Result } from "effect"
import { describe, expect, it } from "vitest"
import { createProviderModel } from "./ai.ts"

describe("createProviderModel", () => {
  it("fails with AICredentialError on the Effect channel for unsupported providers", async () => {
    const outcome = await Effect.runPromise(Effect.result(createProviderModel("unknown-provider", "gpt-4", "sk-test")))

    expect(Result.isFailure(outcome)).toBe(true)
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(AICredentialError)
      expect(outcome.failure.provider).toBe("unknown-provider")
      expect(outcome.failure.statusCode).toBe(400)
    }
  })

  it("succeeds with a language model for anthropic", async () => {
    const model = await Effect.runPromise(createProviderModel("anthropic", "claude-3-5-sonnet-20241022", "sk-ant-test"))
    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })

  it("succeeds with a language model for openai", async () => {
    const model = await Effect.runPromise(createProviderModel("openai", "gpt-4o", "sk-openai-test"))
    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
  })
})
