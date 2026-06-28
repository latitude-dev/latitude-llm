import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { updateSignalUseCase } from "./update-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeUserSignal = (): Signal => ({
  id: SignalId(signalId),
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
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

const makeEvaluationRepository = (evaluations: readonly Evaluation[] = []) => {
  const saved: Evaluation[] = []
  const repository = EvaluationRepository.of({
    findById: () => Effect.die("not used"),
    save: (evaluation) => Effect.sync(() => void saved.push(evaluation)),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    listBySignalId: () => Effect.succeed({ items: [...evaluations], hasMore: false, limit: 100, offset: 0 }),
    listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    softDelete: () => Effect.void,
    softDeleteBySignalId: () => Effect.void,
  })
  return { repository, saved }
}

const provide = (
  signalRepository: ReturnType<typeof createFakeSignalRepository>["repository"],
  evaluationRepository: ReturnType<typeof makeEvaluationRepository>["repository"],
) =>
  Effect.provide(
    Layer.mergeAll(
      Layer.succeed(SignalRepository, signalRepository),
      Layer.succeed(EvaluationRepository, evaluationRepository),
    ),
  )

describe("updateSignalUseCase", () => {
  it("updates name, description, and filters; keeps the slug stable", async () => {
    const { repository, issues } = createFakeSignalRepository([makeUserSignal()])
    const { repository: evaluationRepository } = makeEvaluationRepository()

    const result = await Effect.runPromise(
      updateSignalUseCase({
        projectId,
        signalId: SignalId(signalId),
        name: "Checkout latency",
        description: "Checkout is slow",
        filters: { "tags.service": [{ op: "in", value: ["checkout"] }] },
      }).pipe(
        provide(repository, evaluationRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.changed).toBe(true)
    const signal = issues.get(signalId)
    expect(signal?.name).toBe("Checkout latency")
    expect(signal?.description).toBe("Checkout is slow")
    expect(signal?.filters).not.toBeNull()
    expect(signal?.slug).toBe("slow-checkout")
  })

  it("is a no-op when no fields are provided", async () => {
    const { repository, issues } = createFakeSignalRepository([makeUserSignal()])
    const { repository: evaluationRepository } = makeEvaluationRepository()

    const result = await Effect.runPromise(
      updateSignalUseCase({ projectId, signalId: SignalId(signalId) }).pipe(
        provide(repository, evaluationRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.changed).toBe(false)
    expect(issues.get(signalId)?.name).toBe("Slow checkout")
  })

  it("syncs the active evaluation's name when the signal is renamed", async () => {
    const { repository } = createFakeSignalRepository([makeUserSignal()])
    const evaluation = {
      id: "eeeeeeeeeeeeeeeeeeeeeeee",
      signalId,
      projectId,
      name: "Slow checkout",
    } as unknown as Evaluation
    const { repository: evaluationRepository, saved } = makeEvaluationRepository([evaluation])

    await Effect.runPromise(
      updateSignalUseCase({ projectId, signalId: SignalId(signalId), name: "Checkout latency" }).pipe(
        provide(repository, evaluationRepository),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe("Checkout latency")
  })
})
