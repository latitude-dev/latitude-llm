import type { AIShape } from "@domain/ai"
import { AIError } from "@domain/ai"
import { AIMeteringRecordError, AIMeteringScope, type AIMeteringScopeShape } from "@domain/billing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withAIMetering } from "./metering.ts"

const GENERATE_RESULT = { object: { ok: true }, tokens: 10, duration: 1 }
const EMBED_RESULT = { embedding: [1, 0, 0] }

const createFakeAI = (options?: { readonly failGenerate?: boolean }): AIShape => ({
  generate: <T>() =>
    options?.failGenerate
      ? Effect.fail(new AIError({ message: "provider exploded" }))
      : Effect.succeed(GENERATE_RESULT as never as { object: T; tokens: number; duration: number }),
  embed: () => Effect.succeed(EMBED_RESULT),
  rerank: () => Effect.succeed([]),
})

const createScope = (options?: { readonly failRecord?: boolean }) => {
  const recorded: { action: string; metadata?: Record<string, unknown> | undefined }[] = []
  const scope: AIMeteringScopeShape = {
    organizationId: "org-1" as AIMeteringScopeShape["organizationId"],
    record: (input) =>
      options?.failRecord
        ? Effect.fail(new AIMeteringRecordError({ organizationId: "org-1", action: input.action, cause: "boom" }))
        : Effect.sync(() => {
            recorded.push(input)
          }),
  }
  return { scope, recorded }
}

describe("withAIMetering", () => {
  it("records one llm-call per generation under a scope", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI())

    await Effect.runPromise(
      ai
        .generate({
          provider: "amazon-bedrock",
          model: "minimax.minimax-m2.5",
          system: "s",
          prompt: "p",
          schema: null as never,
        })
        .pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "llm-call",
        metadata: { provider: "amazon-bedrock", model: "minimax.minimax-m2.5" },
      },
    ])
  })

  it("records the llm-call when the provider call fails with AIError", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI({ failGenerate: true }))

    const exit = await Effect.runPromiseExit(
      ai
        .generate({ provider: "p", model: "m", system: "s", prompt: "p", schema: null as never })
        .pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(exit._tag).toBe("Failure")
    expect(recorded.map((entry) => entry.action)).toEqual(["llm-call"])
  })

  it("passes through unbilled without a scope", async () => {
    const ai = withAIMetering(createFakeAI())

    const result = await Effect.runPromise(
      ai.generate({ provider: "p", model: "m", system: "s", prompt: "p", schema: null as never }),
    )

    expect(result).toEqual(GENERATE_RESULT)
  })

  it("records one semantic-query per query-time embedding and none for document embeds", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI())

    await Effect.runPromise(
      Effect.all([
        ai.embed({ text: "q", provider: "voyage", model: "voyage-4-large", inputType: "query" }),
        ai.embed({ text: "d", provider: "voyage", model: "voyage-4-large", inputType: "document" }),
        ai.embed({ text: "default", provider: "voyage", model: "voyage-4-large" }),
      ]).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "semantic-query",
        metadata: { provider: "voyage", model: "voyage-4-large" },
      },
    ])
  })

  it("surfaces record failures as AIError so retries can recharge idempotently", async () => {
    const { scope } = createScope({ failRecord: true })
    const ai = withAIMetering(createFakeAI())

    const exit = await Effect.runPromiseExit(
      ai
        .generate({ provider: "p", model: "m", system: "s", prompt: "p", schema: null as never })
        .pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(exit._tag).toBe("Failure")
  })
})
