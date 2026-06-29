import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { createSignalUseCase } from "./create-signal.ts"

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

const createFakeEvaluationRepository = () => {
  const evaluations = new Map<string, Evaluation>()
  const service = EvaluationRepository.of({
    findById: (id) =>
      Effect.sync(() => evaluations.get(id)).pipe(
        Effect.flatMap((e) => (e ? Effect.succeed(e) : Effect.die(`evaluation ${id} not found`))),
      ),
    save: (evaluation) => Effect.sync(() => void evaluations.set(evaluation.id, evaluation)),
    listByProjectId: () => Effect.succeed({ items: [...evaluations.values()], hasMore: false, limit: 100, offset: 0 }),
    listBySignalId: ({ signalId }) =>
      Effect.succeed({
        items: [...evaluations.values()].filter((e) => e.signalId === signalId),
        hasMore: false,
        limit: 100,
        offset: 0,
      }),
    listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    softDelete: () => Effect.void,
    softDeleteBySignalId: () => Effect.void,
  })
  return { evaluations, service }
}

const buildLayer = () => {
  const { repository: signalRepository, issues } = createFakeSignalRepository()
  const evaluationRepo = createFakeEvaluationRepository()
  const events: OutboxWriteEvent[] = []
  const outboxEventWriter = OutboxEventWriter.of({
    write: (event) => Effect.sync(() => void events.push(event)),
  })
  const layer = Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(EvaluationRepository, evaluationRepo.service),
    Layer.succeed(OutboxEventWriter, outboxEventWriter),
    createFakeScriptRuntime().layer,
  )
  return { layer, issues, evaluations: evaluationRepo.evaluations, events }
}

const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)

describe("createSignalUseCase", () => {
  it("creates a user signal with no centroid and a deterministic evaluation", async () => {
    const { layer, issues, evaluations } = buildLayer()

    const result = await run(
      createSignalUseCase({
        organizationId,
        projectId,
        name: "Slow checkout",
        description: "Checkout responses take too long",
        evaluation: { script: "return Passed(1, 'ok')" },
      }).pipe(Effect.provide(layer), Effect.provideService(SqlClient, createPassthroughSqlClient())),
    )

    const signal = issues.get(result.signalId)
    expect(signal?.origin).toBe("user")
    expect(signal?.source).toBe("custom")
    expect(signal?.centroid).toBeNull()
    expect(signal?.clusteredAt).toBeNull()

    const evaluation = evaluations.get(result.evaluationId)
    expect(evaluation?.signalId).toBe(result.signalId)
    expect(evaluation?.alignment ?? null).toBeNull()
  })

  it("copies signal filters onto the evaluation trigger pre-gate", async () => {
    const { layer, evaluations } = buildLayer()
    const filters = { "tags.service": [{ op: "in" as const, value: ["checkout"] }] }

    const result = await run(
      createSignalUseCase({
        organizationId,
        projectId,
        name: "Slow checkout",
        description: "Checkout responses take too long",
        filters,
        evaluation: { script: "return Passed(1, 'ok')" },
      }).pipe(Effect.provide(layer), Effect.provideService(SqlClient, createPassthroughSqlClient())),
    )

    const evaluation = evaluations.get(result.evaluationId)
    expect(evaluation?.trigger.filter).toEqual(filters)
  })

  it("creates a judge evaluation from settings", async () => {
    const { layer, evaluations, events } = buildLayer()

    const result = await run(
      createSignalUseCase({
        organizationId,
        projectId,
        name: "Refuses valid requests",
        description: "The assistant refuses requests it should answer",
        evaluation: { settings: { kind: "judge", criteria: "the assistant refuses a valid request" } },
      }).pipe(Effect.provide(layer), Effect.provideService(SqlClient, createPassthroughSqlClient())),
    )

    const evaluation = evaluations.get(result.evaluationId)
    expect(evaluation?.settings).toEqual({ kind: "judge", criteria: "the assistant refuses a valid request" })
    expect(evaluation?.script).toContain("await llm(")

    expect(events.some((e) => e.eventName === "SignalCreated")).toBe(true)
  })
})
