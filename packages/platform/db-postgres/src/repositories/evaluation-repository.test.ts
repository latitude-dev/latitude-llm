import { EvaluationRepository, evaluationSchema, wrapPromptAsEvaluationScript } from "@domain/evaluations"
import { EvaluationId, OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { evaluations as evaluationsTable } from "../schema/evaluations.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { EvaluationRepositoryLive } from "./evaluation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))
const otherSignalId = SignalId("j".repeat(24))
const evaluationId = EvaluationId("e".repeat(24))
const archivedEvaluationId = EvaluationId("a".repeat(24))
const deletedEvaluationId = EvaluationId("d".repeat(24))

const makeEvaluation = (
  overrides: Partial<ReturnType<typeof evaluationSchema.parse>> = {},
): ReturnType<typeof evaluationSchema.parse> =>
  evaluationSchema.parse({
    id: evaluationId,
    organizationId: organizationId as string,
    projectId: projectId as string,
    signalId: signalId as string,
    name: "Secret Leakage Monitor",
    description: "Detects when the agent leaks secrets.",
    script: wrapPromptAsEvaluationScript("Check for secret leakage in the conversation."),
    trigger: {
      turn: "every",
      debounce: 0,
      sampling: 10,
    },
    alignment: {
      evaluationHash: "hash-1",
      confusionMatrix: {
        truePositives: 12,
        falsePositives: 2,
        falseNegatives: 1,
        trueNegatives: 35,
      },
    },
    alignedAt: new Date("2026-04-01T01:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T01:00:00.000Z"),
    ...overrides,
  })

const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(EvaluationRepositoryLive, database.appPostgresClient, organizationId)

describe("EvaluationRepositoryLive", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(evaluationsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("persists evaluations and filters active, archived, and issue-linked rows", async () => {
    const active = makeEvaluation()
    const archived = makeEvaluation({
      id: archivedEvaluationId,
      name: "Archived Secret Leakage Monitor",
      archivedAt: new Date("2026-04-02T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const deleted = makeEvaluation({
      id: deletedEvaluationId,
      name: "Deleted Secret Leakage Monitor",
      deletedAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        yield* repository.save(active)
        yield* repository.save(archived)
        yield* repository.save(deleted)

        const activePage = yield* repository.listByProjectId({
          projectId,
          options: { lifecycle: "active" },
        })
        const archivedPage = yield* repository.listByProjectId({
          projectId,
          options: { lifecycle: "archived" },
        })
        const allPage = yield* repository.listBySignalId({
          projectId,
          signalId,
          options: { lifecycle: "all" },
        })
        const bySignalIdsPage = yield* repository.listBySignalIds({
          projectId,
          signalIds: [signalId, otherSignalId],
          options: { lifecycle: "all" },
        })

        expect(activePage.items.map((item) => item.id)).toEqual([active.id])
        expect(archivedPage.items.map((item) => item.id)).toEqual([archived.id])
        expect(allPage.items.map((item) => item.id).sort()).toEqual([active.id, archived.id].sort())
        expect(bySignalIdsPage.items.map((item) => item.id).sort()).toEqual([active.id, archived.id].sort())
      }).pipe(makeProvider(database)),
    )
  })

  it("applies archive, unarchive, soft-delete, and softDeleteBySignalId lifecycle operations", async () => {
    const first = makeEvaluation({
      id: EvaluationId("f".repeat(24)),
      name: "First lifecycle evaluation",
    })
    // Archived so it can coexist with `first` under the one-active-evaluation-per-signal index.
    const second = makeEvaluation({
      id: EvaluationId("g".repeat(24)),
      name: "Second lifecycle evaluation",
      archivedAt: new Date("2026-04-01T01:00:00.000Z"),
    })
    const otherSignalEvaluation = makeEvaluation({
      id: EvaluationId("h".repeat(24)),
      signalId: otherSignalId as string,
      name: "Other issue evaluation",
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationRepository
        yield* repository.save(first)
        yield* repository.save(second)
        yield* repository.save(otherSignalEvaluation)
        yield* repository.archive(first.id)
        yield* repository.unarchive(first.id)
        yield* repository.softDelete(first.id)
        yield* repository.softDeleteBySignalId({ projectId, signalId })
      }).pipe(makeProvider(database)),
    )

    const rows = await database.db
      .select()
      .from(evaluationsTable)
      .where(
        and(eq(evaluationsTable.organizationId, organizationId as string), eq(evaluationsTable.projectId, projectId)),
      )

    const deletedRow = rows.find((row) => row.id === first.id)
    const secondDeletedRow = rows.find((row) => row.id === second.id)
    const untouchedRow = rows.find((row) => row.id === otherSignalEvaluation.id)

    expect(deletedRow?.deletedAt).not.toBeNull()
    expect(secondDeletedRow?.deletedAt).not.toBeNull()
    expect(untouchedRow?.deletedAt).toBeNull()
  })
})
