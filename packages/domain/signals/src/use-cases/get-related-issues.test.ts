import {
  type SignalCoOccurrenceAggregate,
  type SignalOccurrenceAggregate,
  ScoreAnalyticsRepository,
  type ScoreAnalyticsTimeRange,
} from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, SignalId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS } from "../constants.ts"
import type { Signal } from "../entities/issue.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-issue-repository.ts"
import { getRelatedSignalsUseCase } from "./get-related-issues.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const sourceSignalId = SignalId("s".repeat(24))
const twinSignalId = SignalId("a".repeat(24))
const resolvedTwinSignalId = SignalId("b".repeat(24))
const coOccurringSignalId = SignalId("c".repeat(24))
const vanishedSignalId = SignalId("v".repeat(24))

const now = new Date("2026-06-01T12:00:00.000Z")

/** Unit-ish embedding with the given leading components (rest zero). */
const embedding = (...components: number[]): { base: number[]; mass: number } => {
  const base = createSignalCentroid().base
  components.forEach((value, index) => {
    base[index] = value
  })
  return { base, mass: 1 }
}

const makeSignal = (overrides: Partial<Signal> & { id: Signal["id"] }): Signal => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: `issue-${(overrides.id as string).slice(0, 4)}`,
  name: `Signal ${(overrides.id as string).slice(0, 4)}`,
  description: "An issue",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-01-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

const buildLayer = (input: {
  readonly issues: readonly Signal[]
  readonly coOccurrence?: SignalCoOccurrenceAggregate
  readonly occurrenceAggregates?: readonly SignalOccurrenceAggregate[]
  readonly captureTimeRange?: (timeRange: ScoreAnalyticsTimeRange) => void
}) => {
  const signalRepo = createFakeSignalRepository(input.issues)
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    coOccurrenceBySignal: ({ timeRange }) =>
      Effect.sync(() => {
        input.captureTimeRange?.(timeRange)
        return input.coOccurrence ?? { mySessions: 0, totalSessions: 0, candidates: [] }
      }),
    aggregateBySignals: () => Effect.succeed(input.occurrenceAggregates ?? []),
  })
  return Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepo.repository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )
}

describe("getRelatedSignalsUseCase", () => {
  it("merges semantic and co-occurrence signals, hydrates rows, and sorts by relatedness", async () => {
    const layer = buildLayer({
      issues: [
        // Source: unit vector on dim 0.
        makeSignal({ id: sourceSignalId, centroid: { ...createSignalCentroid(), ...embedding(1) } }),
        // Cosine 0.7 → semScore 0.5.
        makeSignal({
          id: twinSignalId,
          centroid: { ...createSignalCentroid(), ...embedding(0.7, Math.sqrt(1 - 0.7 ** 2)) },
        }),
        // Cosine 0.8 → semScore ≈ 0.83; resolved — must still rank, with the state surfaced.
        makeSignal({
          id: resolvedTwinSignalId,
          resolvedAt: new Date("2026-05-01T00:00:00.000Z"),
          centroid: { ...createSignalCentroid(), ...embedding(0.8, 0.6) },
        }),
        // Orthogonal (cosine 0) — reachable only through co-occurrence.
        makeSignal({ id: coOccurringSignalId, centroid: { ...createSignalCentroid(), ...embedding(0, 0, 1) } }),
      ],
      coOccurrence: {
        mySessions: 20,
        totalSessions: 1000,
        candidates: [{ signalId: coOccurringSignalId, sharedSessions: 10, theirSessions: 20 }], // NPMI ≈ 0.70
      },
      occurrenceAggregates: [
        {
          signalId: resolvedTwinSignalId,
          totalOccurrences: 42,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-05-20T00:00:00.000Z"),
        },
      ],
    })

    const related = await Effect.runPromise(
      getRelatedSignalsUseCase({ organizationId, projectId, signalId: sourceSignalId, now }).pipe(Effect.provide(layer)),
    )

    // resolvedTwin (0.83) > coOccurring (0.70) > twin (0.5).
    expect(related.map((row) => row.signalId)).toEqual([resolvedTwinSignalId, coOccurringSignalId, twinSignalId])

    const [resolvedTwin, coOccurring, twin] = related
    expect(resolvedTwin?.states).toContain("resolved")
    expect(resolvedTwin?.name).toBe(`Signal ${"b".repeat(4)}`)
    expect(resolvedTwin?.slug).toBe(`issue-${"b".repeat(4)}`)
    expect(resolvedTwin?.description).toBe("An issue")
    expect(resolvedTwin?.semantic?.similarity).toBeCloseTo(0.8, 5)
    expect(resolvedTwin?.coOccurrence).toBeNull()
    expect(resolvedTwin?.occurrences).toBe(42)
    expect(resolvedTwin?.lastSeenAt).toEqual(new Date("2026-05-20T00:00:00.000Z"))

    expect(coOccurring?.states).toEqual(["ongoing"])
    // No analytics row for this candidate — stats degrade to zero/null.
    expect(coOccurring?.occurrences).toBe(0)
    expect(coOccurring?.lastSeenAt).toBeNull()
    expect(coOccurring?.semantic).toBeNull()
    expect(coOccurring?.coOccurrence?.sharedSessions).toBe(10)
    expect(coOccurring?.coOccurrence?.sharedSessionsPercent).toBeCloseTo(0.5, 10)

    expect(twin?.semantic?.score).toBeCloseTo(0.5, 5)
  })

  it("windows the co-occurrence read to the trailing configured days", async () => {
    let captured: ScoreAnalyticsTimeRange | undefined
    const layer = buildLayer({
      issues: [makeSignal({ id: sourceSignalId, centroid: { ...createSignalCentroid(), ...embedding(1) } })],
      captureTimeRange: (timeRange) => {
        captured = timeRange
      },
    })

    await Effect.runPromise(
      getRelatedSignalsUseCase({ organizationId, projectId, signalId: sourceSignalId, now }).pipe(Effect.provide(layer)),
    )

    expect(captured?.to).toEqual(now)
    expect(captured?.from).toEqual(
      new Date(now.getTime() - SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    )
  })

  it("drops candidates that cannot be hydrated and returns empty when nothing relates", async () => {
    const layer = buildLayer({
      issues: [makeSignal({ id: sourceSignalId, centroid: { ...createSignalCentroid(), ...embedding(1) } })],
      coOccurrence: {
        mySessions: 20,
        totalSessions: 1000,
        // Strong co-occurrence, but the issue row no longer exists in Postgres.
        candidates: [{ signalId: vanishedSignalId, sharedSessions: 10, theirSessions: 20 }],
      },
    })

    const related = await Effect.runPromise(
      getRelatedSignalsUseCase({ organizationId, projectId, signalId: sourceSignalId, now }).pipe(Effect.provide(layer)),
    )

    expect(related).toEqual([])
  })
})
