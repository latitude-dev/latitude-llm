import { type AnnotationScore, ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  OrganizationId,
  ScoreId,
  SessionId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { reconcileConsolidatedScoresUseCase } from "./reconcile-consolidated-scores.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const idFor = (label: string) => SignalId(label.padEnd(24, "x"))
const A = idFor("survivor-a")
const B = idFor("loser-b")
const C = idFor("survivor-c")

const createdAt = new Date("2026-05-01T00:00:00.000Z")

const makeCandidate = (id: SignalId): Signal => ({
  id,
  organizationId,
  projectId,
  slug: `ACM-${id.slice(0, 6)}`,
  name: "The assistant leaked a token.",
  description: "The assistant leaked a token.",
  source: "flagger",
  origin: "system",
  scoreEvidence: [],
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: createdAt,
  promotedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: null,
  deletedAt: null,
  createdAt,
  updatedAt: createdAt,
})

const makeScore = (id: string, signalId: SignalId, at: Date): AnnotationScore => ({
  id: ScoreId(id.padEnd(24, "x")),
  organizationId,
  projectId,
  sessionId: SessionId(`session-${id}`),
  traceId: null,
  spanId: null,
  sourceType: "annotation",
  sourceId: "SYSTEM",
  simulationId: null,
  signalId,
  value: 0.2,
  passed: false,
  feedback: "The assistant leaked a token.",
  metadata: { rawFeedback: "The assistant leaked a token." },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  annotatorId: null,
  createdAt: at,
  updatedAt: at,
})

const passthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

/**
 * The two merges of a chain, with the reconciliation jobs run in whichever
 * order the caller asks for. Postgres is applied in merge order, since that is
 * what the merge transactions do; only the ClickHouse jobs are reordered.
 */
const runChain = async (jobs: readonly SignalId[]) => {
  const signals = createFakeSignalRepository([makeCandidate(A), makeCandidate(B), makeCandidate(C)])
  const { repository: scoreRepository, scores } = createFakeScoreRepository()
  const analytics = createFakeScoreAnalyticsRepository()

  const bScore = makeScore("sc-b", B, new Date("2026-04-01T00:00:00.000Z"))
  const aScore = makeScore("sc-a", A, createdAt)
  scores.set(bScore.id, bScore)
  scores.set(aScore.id, aScore)

  const provide = <T, E>(effect: Effect.Effect<T, E, never>) => effect
  const layers = <T, E>(effect: Effect.Effect<T, E, never>) => provide(effect)

  const merge = (survivorId: SignalId, loserIds: readonly SignalId[]) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        const scoresRepository = yield* ScoreRepository
        yield* scoresRepository.reassignSignal({
          projectId: projectId as never,
          fromSignalIds: loserIds,
          toSignalId: survivorId,
          updatedAt: createdAt,
        })
        yield* repository.markMerged({ survivorId, loserIds, now: createdAt })
      }).pipe(
        Effect.provideService(SignalRepository, signals.repository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(SqlClient, passthroughSqlClient()),
      ),
    )

  const reconcile = (survivorId: SignalId) =>
    Effect.runPromise(
      layers(
        reconcileConsolidatedScoresUseCase({ projectId, survivorId }).pipe(
          Effect.provideService(SignalRepository, signals.repository),
          Effect.provideService(ScoreRepository, scoreRepository),
          Effect.provideService(ScoreAnalyticsRepository, analytics.repository),
          Effect.provideService(SqlClient, passthroughSqlClient()),
          Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
        ),
      ),
    )

  await merge(A, [B])
  await merge(C, [A])
  const results = []
  for (const survivorId of jobs) results.push(await reconcile(survivorId))
  return { results, reassignments: analytics.reassignments }
}

describe("reconcileConsolidatedScoresUseCase", () => {
  it("sweeps the survivor's whole absorbed lineage, not just the ids of one merge", async () => {
    const { reassignments } = await runChain([A, C])

    const toC = reassignments.find((entry) => entry.toSignalId === C)
    // C absorbed A, and A had absorbed B. Sweeping only `A` would leave B's rows
    // behind on a signal that no longer exists.
    expect([...(toC?.fromSignalIds ?? [])].sort()).toEqual([A, B].sort())
  })

  it("converges on the same owner when the chained jobs run in reverse", async () => {
    const forward = await runChain([A, C])
    const reversed = await runChain([C, A])

    const target = (entries: readonly { fromSignalIds: readonly string[]; toSignalId: string }[]) =>
      entries.flatMap((entry) => entry.fromSignalIds.map((from) => `${from}->${entry.toSignalId}`)).sort()

    // The later merge's predicate covers what the earlier one may not have moved
    // yet, so B lands on C either way.
    expect(target(forward.reassignments)).toContain(`${B}->${C}`)
    expect(target(reversed.reassignments)).toContain(`${B}->${C}`)
  })

  it("skips a survivor that absorbed nothing", async () => {
    const signals = createFakeSignalRepository([makeCandidate(A)])
    const { repository: scoreRepository } = createFakeScoreRepository()
    const analytics = createFakeScoreAnalyticsRepository()

    const result = await Effect.runPromise(
      reconcileConsolidatedScoresUseCase({ projectId, survivorId: A }).pipe(
        Effect.provideService(SignalRepository, signals.repository),
        Effect.provideService(ScoreRepository, scoreRepository),
        Effect.provideService(ScoreAnalyticsRepository, analytics.repository),
        Effect.provideService(SqlClient, passthroughSqlClient()),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
    )

    expect(result).toEqual({ action: "skipped", absorbed: 0 })
    expect(analytics.reassignments).toEqual([])
  })
})
