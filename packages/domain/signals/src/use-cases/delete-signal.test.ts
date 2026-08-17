import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { deleteSignalUseCase } from "./delete-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeUserSignal = (id: string): Signal => ({
  id: SignalId(id),
  organizationId,
  projectId,
  slug: "slow-checkout",
  name: "Slow checkout",
  description: "Checkout responses take too long",
  source: "custom",
  origin: "user",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  // User-created signals are born promoted.
  promotedAt: new Date("2026-06-01T00:00:00Z"),
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

describe("deleteSignalUseCase", () => {
  it("soft-deletes the signal and archives its active evaluation", async () => {
    const signalId = "ssssssssssssssssssssssss"
    const { repository: signalRepository, issues } = createFakeSignalRepository([makeUserSignal(signalId)])

    const activeEvaluation = { id: "eeeeeeeeeeeeeeeeeeeeeeee", signalId, projectId } as unknown as Evaluation
    const archived: string[] = []
    const evaluationRepository = EvaluationRepository.of({
      findById: () => Effect.die("not used"),
      save: () => Effect.void,
      listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
      listBySignalId: () => Effect.succeed({ items: [activeEvaluation], hasMore: false, limit: 100, offset: 0 }),
      listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
      archive: (id) => Effect.sync(() => void archived.push(id)),
      unarchive: () => Effect.void,
      softDelete: () => Effect.void,
      softDeleteBySignalId: () => Effect.void,
    })

    const result = await Effect.runPromise(
      deleteSignalUseCase({ projectId, signalId: SignalId(signalId) }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
          ),
        ),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.signalId).toBe(signalId)
    expect(issues.get(signalId)?.deletedAt).not.toBeNull()
    expect(archived).toEqual([activeEvaluation.id])
  })

  it("rejects deleting a system-discovered signal", async () => {
    const signalId = "ssssssssssssssssssssssss"
    const systemSignal: Signal = { ...makeUserSignal(signalId), source: "flagger", origin: "system" }
    const { repository: signalRepository, issues } = createFakeSignalRepository([systemSignal])

    const archived: string[] = []
    const evaluationRepository = EvaluationRepository.of({
      findById: () => Effect.die("not used"),
      save: () => Effect.void,
      listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
      listBySignalId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
      listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
      archive: (id) => Effect.sync(() => void archived.push(id)),
      unarchive: () => Effect.void,
      softDelete: () => Effect.void,
      softDeleteBySignalId: () => Effect.void,
    })

    await expect(
      Effect.runPromise(
        deleteSignalUseCase({ projectId, signalId: SignalId(signalId) }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(SignalRepository, signalRepository),
              Layer.succeed(EvaluationRepository, evaluationRepository),
            ),
          ),
          Effect.provideService(SqlClient, createPassthroughSqlClient()),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "BadRequestError" })

    expect(issues.get(signalId)?.deletedAt ?? null).toBeNull()
    expect(archived).toEqual([])
  })
})
