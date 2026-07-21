import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { createSignalUseCase } from "./create-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const projectSlug = "acme-signals"

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
  const { repository: projectRepository } = createFakeProjectRepository([
    createProject({
      id: ProjectId(projectId),
      organizationId: OrganizationId(organizationId),
      name: "Acme",
      slug: projectSlug,
    }),
  ])
  const events: OutboxWriteEvent[] = []
  const outboxEventWriter = OutboxEventWriter.of({
    write: (event) => Effect.sync(() => void events.push(event)),
  })
  const layer = Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(EvaluationRepository, evaluationRepo.service),
    Layer.succeed(OutboxEventWriter, outboxEventWriter),
    Layer.succeed(ProjectRepository, projectRepository),
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
    // JIRA-style slug: 3-char uppercase project prefix ("acme-signals" → "ACM") + 4-char cuid.
    expect(result.slug).toMatch(/^ACM-[A-Z0-9]{4}$/)

    const evaluation = evaluations.get(result.evaluationId)
    expect(evaluation?.signalId).toBe(result.signalId)
    expect(evaluation?.alignment ?? null).toBeNull()
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

  it("creates a rule evaluation from settings, compiling to a pure script", async () => {
    const { layer, evaluations, events } = buildLayer()

    const result = await run(
      createSignalUseCase({
        organizationId,
        projectId,
        name: "Empty output",
        description: "The assistant returned nothing useful",
        evaluation: {
          settings: {
            kind: "rule",
            match: "any",
            conditions: [{ type: "empty_output" }, { type: "tool_failed" }],
          },
        },
      }).pipe(Effect.provide(layer), Effect.provideService(SqlClient, createPassthroughSqlClient())),
    )

    const evaluation = evaluations.get(result.evaluationId)
    expect(evaluation?.settings).toMatchObject({ kind: "rule", match: "any" })
    expect(evaluation?.script).toContain("return Passed(")
    expect(evaluation?.script).not.toContain("await llm(")

    expect(events.some((e) => e.eventName === "SignalCreated")).toBe(true)
  })
})
