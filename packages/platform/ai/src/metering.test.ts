import type { AIShape, EmbedResult, GenerateResult } from "@domain/ai"
import { AIError } from "@domain/ai"
import {
  AIMeteringRecordError,
  AIMeteringScope,
  type AIMeteringScopeShape,
  creditsForLlmGenerationCost,
  creditsForSemanticQueryCost,
  semanticQueryEmbedCostUsd,
} from "@domain/billing"
import { estimateTotalCost, getCostSpec } from "@domain/models"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withAIMetering } from "./metering.ts"

const EMBED_RESULT = { embedding: [1, 0, 0] }

const createFakeAI = (options?: {
  readonly failGenerate?: boolean
  readonly generateResult?: GenerateResult<unknown>
  readonly embedResult?: EmbedResult
}): AIShape => ({
  generate: <T>() =>
    options?.failGenerate
      ? Effect.fail(new AIError({ message: "provider exploded" }))
      : Effect.succeed(
          (options?.generateResult ?? { object: { ok: true }, tokens: 10, duration: 1 }) as never as {
            object: T
            tokens: number
            duration: number
          },
        ),
  embed: () => Effect.succeed(options?.embedResult ?? EMBED_RESULT),
  rerank: () => Effect.succeed([]),
})

const createScope = (options?: { readonly failRecord?: boolean }) => {
  const recorded: {
    action: string
    credits?: number | undefined
    metadata?: Record<string, unknown> | undefined
  }[] = []
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

const generateInput = (provider: string, model: string) => ({
  provider,
  model,
  system: "s",
  prompt: "p",
  schema: null as never,
})

describe("withAIMetering", () => {
  it("bills a generation its estimated cost with a 1.3x margin when usage and pricing are known", async () => {
    const usage = { input: 100_000, output: 4_000 }
    const costSpec = getCostSpec("openai", "gpt-4o")
    expect(costSpec.costImplemented).toBe(true)
    const expectedCredits = creditsForLlmGenerationCost(estimateTotalCost(costSpec.cost, usage))
    expect(expectedCredits).toBeGreaterThan(1)

    const { scope, recorded } = createScope()
    const ai = withAIMetering(
      createFakeAI({ generateResult: { object: { ok: true }, tokens: 104_000, duration: 1, tokenUsage: usage } }),
    )

    await Effect.runPromise(
      ai.generate(generateInput("openai", "gpt-4o")).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "llm-call",
        credits: expectedCredits,
        metadata: {
          provider: "openai",
          model: "gpt-4o",
          pricing: "cost-based",
          estimatedCostUsd: estimateTotalCost(costSpec.cost, usage),
          tokensInput: 100_000,
          tokensOutput: 4_000,
        },
      },
    ])
  })

  it("falls back to the flat llm-call price when the registry has no pricing for the model", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(
      createFakeAI({
        generateResult: { object: { ok: true }, tokens: 10, duration: 1, tokenUsage: { input: 8, output: 2 } },
      }),
    )

    await Effect.runPromise(
      ai
        .generate(generateInput("unknown-provider", "unknown-model"))
        .pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "llm-call",
        metadata: { provider: "unknown-provider", model: "unknown-model", pricing: "flat-fallback" },
      },
    ])
  })

  it("falls back to the flat llm-call price when the provider reported no usage", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI())

    await Effect.runPromise(
      ai.generate(generateInput("openai", "gpt-4o")).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "llm-call",
        metadata: { provider: "openai", model: "gpt-4o", pricing: "flat-fallback" },
      },
    ])
  })

  it("records the flat llm-call price when the provider call fails with AIError", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI({ failGenerate: true }))

    const exit = await Effect.runPromiseExit(
      ai.generate(generateInput("p", "m")).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(exit._tag).toBe("Failure")
    expect(recorded).toEqual([
      {
        action: "llm-call",
        metadata: { provider: "p", model: "m", pricing: "flat-fallback" },
      },
    ])
  })

  it("passes through unbilled without a scope", async () => {
    const ai = withAIMetering(createFakeAI())

    const result = await Effect.runPromise(ai.generate(generateInput("p", "m")))

    expect(result).toEqual({ object: { ok: true }, tokens: 10, duration: 1 })
  })

  it("bills a query-time embedding its estimated cost with a 2x margin and none for document embeds", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI({ embedResult: { embedding: [1, 0, 0], tokens: 20_000 } }))

    await Effect.runPromise(
      Effect.all([
        ai.embed({ text: "q", provider: "voyage", model: "voyage-4-large", inputType: "query" }),
        ai.embed({ text: "d", provider: "voyage", model: "voyage-4-large", inputType: "document" }),
        ai.embed({ text: "default", provider: "voyage", model: "voyage-4-large" }),
      ]).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    const estimatedCostUsd = semanticQueryEmbedCostUsd(20_000)
    expect(recorded).toEqual([
      {
        action: "semantic-query",
        credits: creditsForSemanticQueryCost(estimatedCostUsd),
        metadata: {
          provider: "voyage",
          model: "voyage-4-large",
          pricing: "cost-based",
          estimatedCostUsd,
          tokens: 20_000,
        },
      },
    ])
  })

  it("falls back to the flat semantic-query price when the embed adapter reports no token count", async () => {
    const { scope, recorded } = createScope()
    const ai = withAIMetering(createFakeAI())

    await Effect.runPromise(
      ai
        .embed({ text: "q", provider: "voyage", model: "voyage-4-large", inputType: "query" })
        .pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(recorded).toEqual([
      {
        action: "semantic-query",
        metadata: { provider: "voyage", model: "voyage-4-large", pricing: "flat-fallback" },
      },
    ])
  })

  it("surfaces record failures as AIError so retries can recharge idempotently", async () => {
    const { scope } = createScope({ failRecord: true })
    const ai = withAIMetering(createFakeAI())

    const exit = await Effect.runPromiseExit(
      ai.generate(generateInput("p", "m")).pipe(Effect.provideService(AIMeteringScope, scope)),
    )

    expect(exit._tag).toBe("Failure")
  })
})

describe("creditsForLlmGenerationCost", () => {
  it("applies a 1.3x margin at the overage credit value, rounding up", () => {
    // $0.005 x 1.3 = $0.0065 → 3.25 → rounds up to 4 credits
    expect(creditsForLlmGenerationCost(0.005)).toBe(4)
    // $0.04 x 1.3 = $0.052 → 26 credits exactly
    expect(creditsForLlmGenerationCost(0.04)).toBe(26)
    // $0.30 x 1.3 = $0.39 → 195 credits exactly
    expect(creditsForLlmGenerationCost(0.3)).toBe(195)
  })

  it("floors at one credit for near-zero costs", () => {
    expect(creditsForLlmGenerationCost(0)).toBe(1)
    expect(creditsForLlmGenerationCost(0.000001)).toBe(1)
  })
})

describe("creditsForSemanticQueryCost", () => {
  it("applies a 2x margin at the overage credit value, rounding up", () => {
    // 32k-token worst-case query embed: 32_000 x $0.12/M = $0.00384, x2 margin = 7.68 mills → 4 credits
    expect(creditsForSemanticQueryCost(semanticQueryEmbedCostUsd(32_000))).toBe(4)
    // $0.01 x 2 = $0.02 → 10 credits exactly
    expect(creditsForSemanticQueryCost(0.01)).toBe(10)
  })

  it("floors at one credit for near-zero costs", () => {
    expect(creditsForSemanticQueryCost(0)).toBe(1)
    expect(creditsForSemanticQueryCost(semanticQueryEmbedCostUsd(50))).toBe(1)
  })
})
