import { AI, type AIShape, type EmbedResult, type GenerateInput, type GenerateResult } from "@domain/ai"
import { ChSqlClient, FacetId, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FACET_EXTRACTION_INPUT_CHAR_CAP, FACET_PROJECTION_TEXT_MAX_LENGTH } from "../constants.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import type { TaxonomyFacetProjection } from "../entities/facet-projection.ts"
import { FacetProjectionRepository } from "../ports/facet-projection-repository.ts"
import { createFakeFacetProjectionRepository } from "../testing/fake-facet-projection-repository.ts"
import { extractFacetProjectionsUseCase, type FacetExtractionSample } from "./extract-facet-projections.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const facetId = FacetId("f".repeat(24))
const now = new Date("2026-06-04T00:00:00.000Z")

const facet = (overrides: Partial<TaxonomyFacet> = {}): TaxonomyFacet => ({
  id: facetId,
  organizationId,
  projectId,
  slug: "apparent-user-goal",
  name: "Apparent user goal",
  description: "What the user is ultimately trying to accomplish.",
  instructions: "Summarize, in one sentence, what the user is ultimately trying to accomplish.",
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

let seq = 0
const sample = (overrides: Partial<FacetExtractionSample> = {}): FacetExtractionSample => {
  seq += 1
  return {
    sessionObservationId: `obs${seq}`.padEnd(24, "0"),
    sessionId: SessionId(`session-${seq}`),
    transcript: "User: how do I cancel?\nAgent: I can help with that.",
    startTime: now,
    ...overrides,
  }
}

interface AiSpy {
  readonly systemPrompts: string[]
  readonly prompts: string[]
  readonly embedTexts: string[]
  generateCalls: number
  embedCalls: number
}

const makeAi = (
  spy: AiSpy,
  respond: (input: GenerateInput<unknown>) => { unclear: boolean; answer: string } = () => ({
    unclear: false,
    answer: "The user wants to cancel their subscription.",
  }),
): AIShape => ({
  generate: <T>(input: GenerateInput<T>) => {
    spy.generateCalls++
    spy.systemPrompts.push(input.system)
    spy.prompts.push(input.prompt)
    return Effect.succeed({
      object: respond(input as GenerateInput<unknown>) as T,
      tokens: 10,
      duration: 1,
    } satisfies GenerateResult<T>)
  },
  embed: (input) => {
    spy.embedCalls++
    spy.embedTexts.push(input.text)
    return Effect.succeed({ embedding: [3, 4] } satisfies EmbedResult)
  },
  rerank: () => Effect.die("rerank not used"),
})

const run = (
  input: Parameters<typeof extractFacetProjectionsUseCase>[0],
  deps: { ai: AIShape; seed?: readonly TaxonomyFacetProjection[] },
) => {
  const repo = createFakeFacetProjectionRepository(deps.seed ?? [])
  const effect = extractFacetProjectionsUseCase(input).pipe(
    Effect.provide(Layer.succeed(FacetProjectionRepository, repo.repository)),
    Effect.provide(Layer.succeed(AI, deps.ai)),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
  )
  return { effect, repo }
}

const emptySpy = (): AiSpy => ({ systemPrompts: [], prompts: [], embedTexts: [], generateCalls: 0, embedCalls: 0 })

describe("extractFacetProjectionsUseCase", () => {
  it("extracts, embeds, and persists a projection for each cache miss", async () => {
    const spy = emptySpy()
    const first = sample()
    const samples = [first, sample()]
    const { effect, repo } = run({ facet: facet(), samples, now }, { ai: makeAi(spy) })

    const result = await Effect.runPromise(effect)

    expect(spy.generateCalls).toBe(2)
    expect(spy.embedCalls).toBe(2)
    expect(result.extractedCount).toBe(2)
    expect(result.cachedCount).toBe(0)
    expect(result.unclearCount).toBe(0)
    expect(result.projections).toHaveLength(2)
    expect(repo.rows.size).toBe(2)
    const persisted = repo.rows.get(`${facetId}::${first.sessionObservationId}`)
    expect(persisted?.extractedText).toBe("The user wants to cancel their subscription.")
    // [3,4] normalized to unit length.
    expect(persisted?.embedding[0]).toBeCloseTo(0.6, 5)
    expect(persisted?.embedding[1]).toBeCloseTo(0.8, 5)
    expect(persisted?.analysisHash).toHaveLength(64)
  })

  it("skips extraction for cache hits and only extracts the misses", async () => {
    const spy = emptySpy()
    const hit = sample()
    const miss = sample()
    const cached: TaxonomyFacetProjection = {
      organizationId,
      projectId,
      facetId,
      sessionObservationId: hit.sessionObservationId,
      sessionId: hit.sessionId,
      extractedText: "cached answer",
      analysisHash: "a".repeat(64),
      embedding: [1, 0, 0],
      startTime: now,
      retentionDays: 30,
      indexedAt: now,
    }
    const { effect } = run({ facet: facet(), samples: [hit, miss], now }, { ai: makeAi(spy), seed: [cached] })

    const result = await Effect.runPromise(effect)

    expect(spy.generateCalls).toBe(1)
    expect(spy.prompts[0]).toContain(miss.transcript)
    expect(result.cachedCount).toBe(1)
    expect(result.extractedCount).toBe(1)
    expect(result.projections).toHaveLength(2)
  })

  it("persists an unclear answer as empty text with no embedding and marks it", async () => {
    const spy = emptySpy()
    const { effect, repo } = run(
      { facet: facet(), samples: [sample()], now },
      { ai: makeAi(spy, () => ({ unclear: true, answer: "" })) },
    )

    const result = await Effect.runPromise(effect)

    expect(spy.generateCalls).toBe(1)
    expect(spy.embedCalls).toBe(0)
    expect(result.unclearCount).toBe(1)
    expect(result.projections[0]?.extractedText).toBe("")
    expect(result.projections[0]?.embedding).toEqual([])
    expect(repo.rows.size).toBe(1)
  })

  it("compiles system-owned guardrails around the facet instructions", async () => {
    const spy = emptySpy()
    const theFacet = facet({ instructions: "Extract the user's stated goal." })
    const { effect } = run({ facet: theFacet, samples: [sample()], now }, { ai: makeAi(spy) })

    await Effect.runPromise(effect)

    const system = spy.systemPrompts[0] ?? ""
    expect(system).toContain("Extract the user's stated goal.")
    expect(system).toContain("ONE sentence")
    expect(system).toContain("untrusted")
    expect(system).toContain("unclear")
    expect(system).toContain("PII")
    expect(system).toContain(String(FACET_PROJECTION_TEXT_MAX_LENGTH))
  })

  it("truncates the conversation input to the character cap", async () => {
    const spy = emptySpy()
    const longTranscript = "x".repeat(FACET_EXTRACTION_INPUT_CHAR_CAP + 5_000)
    const { effect } = run(
      { facet: facet(), samples: [sample({ transcript: longTranscript })], now },
      { ai: makeAi(spy) },
    )

    await Effect.runPromise(effect)

    const xCount = (spy.prompts[0]?.match(/x/g) ?? []).length
    expect(xCount).toBe(FACET_EXTRACTION_INPUT_CHAR_CAP)
  })

  it("bounds the stored answer to the max length", async () => {
    const spy = emptySpy()
    const longAnswer = "a".repeat(FACET_PROJECTION_TEXT_MAX_LENGTH + 200)
    const { effect, repo } = run(
      { facet: facet(), samples: [sample()], now },
      { ai: makeAi(spy, () => ({ unclear: false, answer: longAnswer })) },
    )

    await Effect.runPromise(effect)

    const [row] = [...repo.rows.values()]
    expect(row?.extractedText).toHaveLength(FACET_PROJECTION_TEXT_MAX_LENGTH)
  })

  it("dedupes repeated session observation ids into a single extraction", async () => {
    const spy = emptySpy()
    const dup = sample()
    const { effect } = run({ facet: facet(), samples: [dup, dup], now }, { ai: makeAi(spy) })

    const result = await Effect.runPromise(effect)

    expect(spy.generateCalls).toBe(1)
    expect(result.projections).toHaveLength(1)
  })

  it("returns an empty result and touches nothing when there are no samples", async () => {
    const spy = emptySpy()
    const { effect, repo } = run({ facet: facet(), samples: [], now }, { ai: makeAi(spy) })

    const result = await Effect.runPromise(effect)

    expect(result).toEqual({ projections: [], cachedCount: 0, extractedCount: 0, unclearCount: 0 })
    expect(spy.generateCalls).toBe(0)
    expect(repo.rows.size).toBe(0)
  })
})
