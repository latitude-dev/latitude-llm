import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { ScoreRepository } from "@domain/scores"
import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalScoreEvidence } from "../entities/signal.ts"
import { SignalRepository, type SignalRepositoryShape } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { backfillSignalScoreEvidenceUseCase } from "./backfill-signal-score-evidence.ts"

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const SIGNAL_ID = SignalId("s".repeat(24))
const NOW = new Date("2026-09-03T12:00:00.000Z")

const makeSignal = (scoreEvidence: SignalScoreEvidence[] = []): Signal => ({
  id: SIGNAL_ID,
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  slug: "tool-failure",
  name: "Tool calls fail during data retrieval",
  description: "The retrieval tool returns an operational error before the task can continue.",
  source: "flagger",
  origin: "system",
  scoreEvidence,
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  feedback: null,
  promotedAt: new Date("2026-08-01T00:00:00.000Z"),
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
})

const classification = {
  taskOutcome: false,
  completionOutcome: false,
  operationalIncident: true,
  spendEfficiency: false,
  criticalPathEfficiency: false,
  confirmedHarm: false,
  exposure: false,
}

const generateClassification =
  (output: typeof classification): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({ object: input.schema.parse(output), tokens: 10, duration: 5 })

const run = (input: {
  readonly sample: readonly (string | null)[]
  readonly execute?: boolean
  readonly scoreEvidence?: SignalScoreEvidence[]
  readonly classification?: typeof classification
  readonly signalRepositoryOverrides?: Partial<SignalRepositoryShape>
}) => {
  const { layer: aiLayer, calls } = createFakeAI({
    generate: generateClassification(input.classification ?? classification),
  })
  const { repository: signalRepository, issues } = createFakeSignalRepository(
    [makeSignal(input.scoreEvidence)],
    input.signalRepositoryOverrides,
  )
  const { repository: scoreRepository } = createFakeScoreRepository({
    listFlaggerSlugSampleBySignalId: () => Effect.succeed(input.sample),
  })

  return Effect.runPromise(
    backfillSignalScoreEvidenceUseCase({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      signalId: SIGNAL_ID,
      execute: input.execute ?? true,
      now: NOW,
    }).pipe(
      Effect.provide(aiLayer),
      Effect.provideService(SignalRepository, signalRepository),
      Effect.provideService(ScoreRepository, scoreRepository),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
    ),
  ).then((result) => ({ result, calls, stored: issues.get(SIGNAL_ID) }))
}

describe("backfillSignalScoreEvidenceUseCase", () => {
  it("uses a dominant mapped flagger without calling the LLM", async () => {
    const { result, calls, stored } = await run({ sample: ["incompletion", "incompletion", null] })

    expect(result).toEqual({
      action: "classified",
      method: "deterministic",
      dominantFlaggerSlug: "incompletion",
      scoreEvidence: [{ scoreDimension: "outcome", role: "taskOutcome" }],
      applied: true,
    })
    expect(calls.generate).toHaveLength(0)
    expect(stored?.scoreEvidence).toEqual([{ scoreDimension: "outcome", role: "taskOutcome" }])
    expect(stored?.updatedAt).toEqual(NOW)
  })

  it("classifies the canonical name and description when there is no dominant mapped flagger", async () => {
    const { result, calls, stored } = await run({ sample: ["incompletion", "refusal"] })

    expect(result).toMatchObject({
      action: "classified",
      method: "llm",
      dominantFlaggerSlug: null,
      scoreEvidence: [{ scoreDimension: "reliability", role: "operationalIncident" }],
      applied: true,
    })
    expect(calls.generate).toHaveLength(1)
    expect(String(calls.generate[0]?.prompt)).toContain(makeSignal().name)
    expect(String(calls.generate[0]?.prompt)).toContain(makeSignal().description)
    expect(stored?.scoreEvidence).toEqual([{ scoreDimension: "reliability", role: "operationalIncident" }])
  })

  it("previews the route without calling the LLM or writing", async () => {
    const { result, calls, stored } = await run({ sample: [], execute: false })

    expect(result).toEqual({ action: "planned", method: "llm", dominantFlaggerSlug: null })
    expect(calls.generate).toHaveLength(0)
    expect(stored?.scoreEvidence).toEqual([])
  })

  it("keeps an all-false model classification diagnostic", async () => {
    const { result, stored } = await run({
      sample: [],
      classification: {
        taskOutcome: false,
        completionOutcome: false,
        operationalIncident: false,
        spendEfficiency: false,
        criticalPathEfficiency: false,
        confirmedHarm: false,
        exposure: false,
      },
    })

    expect(result).toMatchObject({ action: "classified", method: "llm", scoreEvidence: [], applied: true })
    expect(stored?.scoreEvidence).toEqual([])
  })

  it("skips a signal that has already been classified", async () => {
    const scoreEvidence = [{ scoreDimension: "outcome", role: "taskOutcome" }] satisfies SignalScoreEvidence[]
    const { result, calls } = await run({ sample: ["incompletion"], scoreEvidence })

    expect(result).toEqual({ action: "skipped", reason: "already-classified" })
    expect(calls.generate).toHaveLength(0)
  })

  it("reports when another writer wins the conditional update", async () => {
    const { result } = await run({
      sample: ["incompletion"],
      signalRepositoryOverrides: { setScoreEvidenceIfEmpty: () => Effect.succeed(false) },
    })

    expect(result).toMatchObject({ action: "classified", method: "deterministic", applied: false })
  })
})
