import {
  createSignalCentroid,
  type Signal,
  SignalRepository,
  signalSchema,
  MIN_OCCURRENCES_FOR_VISIBILITY,
} from "@domain/signals"
import { SignalId, NotFoundError, OrganizationId, ProjectId, SqlClient, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertIncidents as alertIncidentsTable } from "../schema/alert-incidents.ts"
import { signals as signalsTable } from "../schema/signals.ts"
import { projects as projectsTable } from "../schema/projects.ts"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SignalRepositoryLive } from "./signal-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const listTestProjectId = "r".repeat(24)
const otherProjectId = ProjectId("q".repeat(24))
const signalId = SignalId("i".repeat(24))
const otherSignalId = SignalId("j".repeat(24))

const signalBase = {
  organizationId: organizationId as string,
  projectId: projectId as string,
  source: "annotation" as const,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  assigneeId: null,
  priority: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
}

const makeEmbedding = (values: Record<number, number>): number[] => {
  const embedding = createSignalCentroid().base
  for (const [index, value] of Object.entries(values)) {
    embedding[Number(index)] = value
  }
  return embedding
}

const makeSignal = (overrides: Partial<Signal> = {}): Signal => {
  const name = overrides.name ?? "Secret leakage"
  return signalSchema.parse({
    id: signalId,
    slug: toSlug(name),
    name,
    description: "The agent exposes sensitive secrets.",
    ...signalBase,
    ...overrides,
  })
}

const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(SignalRepositoryLive, database.appPostgresClient, organizationId)

const makeCustomScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly signalId: string
  readonly createdAt: Date
}): typeof scoresTable.$inferInsert => ({
  id: input.id,
  organizationId,
  projectId: input.projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "custom",
  sourceId: `source-${input.id}`,
  simulationId: null,
  signalId: input.signalId,
  value: 0.1,
  passed: false,
  feedback: `Feedback for ${input.id}`,
  metadata: { channel: "api" },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
})

const makeAnnotationScoreRow = (input: {
  readonly id: string
  readonly projectId: string
  readonly signalId: string
  readonly createdAt: Date
}): typeof scoresTable.$inferInsert => ({
  id: input.id,
  organizationId,
  projectId: input.projectId,
  sessionId: null,
  traceId: null,
  spanId: null,
  source: "annotation",
  sourceId: "UI",
  simulationId: null,
  signalId: input.signalId,
  value: 0.1,
  passed: false,
  feedback: `Feedback for ${input.id}`,
  metadata: {
    rawFeedback: `Feedback for ${input.id}`,
  },
  error: null,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
})

describe("SignalRepositoryLive", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
    await database.db.delete(scoresTable)
    await database.db.delete(signalsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("persists and reads canonical signals", async () => {
    const canonicalSignal = makeSignal()
    const otherSignal = makeSignal({
      id: otherSignalId,
      name: "Incorrect refusal",
      description: "The agent refuses valid requests.",
      projectId: otherProjectId as string,
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(canonicalSignal)
        yield* repository.save(otherSignal)

        const found = yield* repository.findById(canonicalSignal.id)

        expect(found.name).toBe(canonicalSignal.name)
      }).pipe(makeProvider(database)),
    )
  })

  it("persists and reads flagger-sourced signals", async () => {
    const flaggerSignal = makeSignal({
      source: "flagger",
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(flaggerSignal)

        const found = yield* repository.findById(flaggerSignal.id)

        expect(found.source).toBe("flagger")
      }).pipe(makeProvider(database)),
    )
  })

  it("returns NotFoundError when an issue does not exist", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          return yield* repository.findById(SignalId("z".repeat(24)))
        }).pipe(makeProvider(database)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("finds canonical signals by id within the requested project", async () => {
    const firstSignal = makeSignal()
    const secondSignal = makeSignal({
      id: SignalId("k".repeat(24)),
      name: "Second canonical issue",
    })
    const otherProjectSignal = makeSignal({
      id: SignalId("l".repeat(24)),
      projectId: otherProjectId as string,
      name: "Other project issue",
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(firstSignal)
        yield* repository.save(secondSignal)
        yield* repository.save(otherProjectSignal)
      }).pipe(makeProvider(database)),
    )

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        return yield* repository.findByIds({
          projectId,
          signalIds: [firstSignal.id, secondSignal.id, otherProjectSignal.id],
        })
      }).pipe(makeProvider(database)),
    )

    expect(items.map((item) => item.id).sort()).toEqual([firstSignal.id, secondSignal.id].sort())
  })

  it("runs hybrid search with pgvector score expressions when there are no matches", async () => {
    const normalizedEmbedding = createSignalCentroid().base.map((_, index) => (index === 0 ? 1 : 0))

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        return yield* repository.hybridSearch({
          projectId,
          query: "secret leakage",
          normalizedEmbedding,
        })
      }).pipe(makeProvider(database)),
    )

    expect(items).toEqual([])
  })

  it("runs hybrid search against existing issue vectors", async () => {
    const centroid = createSignalCentroid()
    const normalizedEmbedding = makeEmbedding({ 0: 1 })

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(
          makeSignal({
            centroid: {
              ...centroid,
              base: normalizedEmbedding,
              mass: 1,
            },
          }),
        )

        return yield* repository.hybridSearch({
          projectId,
          query: "secret leakage",
          normalizedEmbedding,
        })
      }).pipe(makeProvider(database)),
    )

    expect(items.map((item) => item.signalId)).toEqual([signalId])
  })

  it("keeps semantically similar issue candidates even with no lexical overlap", async () => {
    const centroid = createSignalCentroid()
    const normalizedEmbedding = makeEmbedding({ 0: 1 })
    const candidateEmbedding = makeEmbedding({ 0: 0.76, 1: Math.sqrt(1 - 0.76 ** 2) })

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(
          makeSignal({
            name: "Billing reconciliation drift",
            description: "Ledger totals differ from invoice exports.",
            centroid: {
              ...centroid,
              base: candidateEmbedding,
              mass: 1,
            },
          }),
        )

        return yield* repository.hybridSearch({
          projectId,
          query: "wizard mentioned quidditch during password reset",
          normalizedEmbedding,
        })
      }).pipe(makeProvider(database)),
    )

    expect(items.map((item) => item.signalId)).toEqual([signalId])
  })

  describe("findSimilarByCentroid", () => {
    const sourceEmbedding = makeEmbedding({ 0: 1 })

    const saveWithEmbedding = (issue: Signal, embedding: number[]) =>
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save({
          ...issue,
          centroid: { ...createSignalCentroid(), base: embedding, mass: 1 },
        })
      })

    it("ranks project neighbors by cosine similarity, excluding self and other projects", async () => {
      const closeNeighborId = SignalId("a".repeat(24))
      const farNeighborId = SignalId("b".repeat(24))
      const orthogonalId = SignalId("c".repeat(24))
      const otherProjectNeighborId = SignalId("d".repeat(24))

      const neighbors = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* saveWithEmbedding(makeSignal(), sourceEmbedding)
          yield* saveWithEmbedding(
            makeSignal({ id: closeNeighborId, name: "Close neighbor" }),
            makeEmbedding({ 0: 0.9, 1: Math.sqrt(1 - 0.9 ** 2) }),
          )
          yield* saveWithEmbedding(
            makeSignal({ id: farNeighborId, name: "Far neighbor" }),
            makeEmbedding({ 0: 0.6, 1: 0.8 }),
          )
          yield* saveWithEmbedding(makeSignal({ id: orthogonalId, name: "Orthogonal" }), makeEmbedding({ 1: 1 }))
          yield* saveWithEmbedding(
            makeSignal({ id: otherProjectNeighborId, name: "Other project", projectId: otherProjectId as string }),
            makeEmbedding({ 0: 0.95, 1: Math.sqrt(1 - 0.95 ** 2) }),
          )

          return yield* repository.findSimilarByCentroid({ projectId, signalId, limit: 10 })
        }).pipe(makeProvider(database)),
      )

      expect(neighbors.map((neighbor) => neighbor.signalId)).toEqual([closeNeighborId, farNeighborId, orthogonalId])
      expect(neighbors[0]?.similarity).toBeCloseTo(0.9, 5)
      expect(neighbors[1]?.similarity).toBeCloseTo(0.6, 5)
      expect(neighbors[2]?.similarity).toBeCloseTo(0, 5)
    })

    it("includes resolved and ignored neighbors and respects the limit", async () => {
      const resolvedId = SignalId("a".repeat(24))
      const ignoredId = SignalId("b".repeat(24))

      const neighbors = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* saveWithEmbedding(makeSignal(), sourceEmbedding)
          yield* saveWithEmbedding(
            makeSignal({ id: resolvedId, name: "Resolved twin", resolvedAt: new Date("2026-04-02T00:00:00.000Z") }),
            makeEmbedding({ 0: 0.9, 1: Math.sqrt(1 - 0.9 ** 2) }),
          )
          yield* saveWithEmbedding(
            makeSignal({ id: ignoredId, name: "Ignored twin", ignoredAt: new Date("2026-04-02T00:00:00.000Z") }),
            makeEmbedding({ 0: 0.8, 1: 0.6 }),
          )

          return yield* repository.findSimilarByCentroid({ projectId, signalId, limit: 1 })
        }).pipe(makeProvider(database)),
      )

      expect(neighbors.map((neighbor) => neighbor.signalId)).toEqual([resolvedId])
    })

    it("skips neighbors without an embedding and returns empty when the source has none", async () => {
      const embeddedNeighborId = SignalId("a".repeat(24))
      const embeddinglessId = SignalId("b".repeat(24))

      const { fromSource, fromEmbeddingless, fromMissing } = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* saveWithEmbedding(makeSignal(), sourceEmbedding)
          yield* saveWithEmbedding(
            makeSignal({ id: embeddedNeighborId, name: "Embedded neighbor" }),
            makeEmbedding({ 0: 0.7, 1: Math.sqrt(1 - 0.7 ** 2) }),
          )
          // Zero-mass centroid → `save` persists a NULL `centroid_embedding`.
          yield* repository.save(makeSignal({ id: embeddinglessId, name: "No embedding yet" }))

          return {
            fromSource: yield* repository.findSimilarByCentroid({ projectId, signalId, limit: 10 }),
            fromEmbeddingless: yield* repository.findSimilarByCentroid({
              projectId,
              signalId: embeddinglessId,
              limit: 10,
            }),
            fromMissing: yield* repository.findSimilarByCentroid({
              projectId,
              signalId: SignalId("z".repeat(24)),
              limit: 10,
            }),
          }
        }).pipe(makeProvider(database)),
      )

      expect(fromSource.map((neighbor) => neighbor.signalId)).toEqual([embeddedNeighborId])
      expect(fromEmbeddingless).toEqual([])
      expect(fromMissing).toEqual([])
    })
  })

  it("lists only visible signals scoped to project, newest-first, and paginates with hasMore", async () => {
    const older = makeSignal({
      id: SignalId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      projectId: listTestProjectId,
      name: "Zebra ordering",
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T08:00:00.000Z"),
    })
    const mid = makeSignal({
      id: SignalId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      projectId: listTestProjectId,
      name: "Beta token mention",
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T09:00:00.000Z"),
    })
    const newest = makeSignal({
      id: SignalId("cccccccccccccccccccccccc"),
      projectId: listTestProjectId,
      name: "Most recent issue",
      createdAt: new Date("2026-03-30T11:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T11:00:00.000Z"),
    })
    const hiddenLowEvidence = makeSignal({
      id: SignalId("dddddddddddddddddddddddd"),
      projectId: listTestProjectId,
      name: "Single weak occurrence",
      createdAt: new Date("2026-03-30T12:00:00.000Z"),
      updatedAt: new Date("2026-03-30T12:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T12:00:00.000Z"),
    })
    const wrongProject = makeSignal({
      id: SignalId("eeeeeeeeeeeeeeeeeeeeeeee"),
      projectId: otherProjectId,
      name: "Wrong project issue",
      createdAt: new Date("2026-03-30T13:00:00.000Z"),
      updatedAt: new Date("2026-03-30T13:00:00.000Z"),
      clusteredAt: new Date("2026-03-30T13:00:00.000Z"),
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(older)
        yield* repository.save(mid)
        yield* repository.save(newest)
        yield* repository.save(hiddenLowEvidence)
        yield* repository.save(wrongProject)
      }).pipe(makeProvider(database)),
    )

    await database.db.insert(scoresTable).values([
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `oldcustomscore000000000${index + 1}`,
          projectId: listTestProjectId,
          signalId: older.id,
          createdAt: new Date("2026-03-30T08:30:00.000Z"),
        }),
      ),
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `newcustomscore000000000${index + 1}`,
          projectId: listTestProjectId,
          signalId: newest.id,
          createdAt: new Date("2026-03-30T11:30:00.000Z"),
        }),
      ),
      makeCustomScoreRow({
        id: "hiddenlowevidencecustom1",
        projectId: listTestProjectId,
        signalId: hiddenLowEvidence.id,
        createdAt: new Date("2026-03-30T12:30:00.000Z"),
      }),
      ...Array.from({ length: MIN_OCCURRENCES_FOR_VISIBILITY }, (_, index) =>
        makeCustomScoreRow({
          id: `wrongprojectscore000000${index + 1}`,
          projectId: otherProjectId,
          signalId: wrongProject.id,
          createdAt: new Date("2026-03-30T13:30:00.000Z"),
        }),
      ),
    ])
    await database.db.insert(scoresTable).values(
      makeAnnotationScoreRow({
        id: "midannotationevidence001",
        projectId: listTestProjectId,
        signalId: mid.id,
        createdAt: new Date("2026-03-30T09:30:00.000Z"),
      }),
    )
    const page1 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        return yield* repository.list({
          projectId: ProjectId(listTestProjectId),
          limit: 2,
          offset: 0,
        })
      }).pipe(makeProvider(database)),
    )

    expect(page1.items.map((issue) => issue.id)).toEqual([newest.id, mid.id])
    expect(page1.items.map((issue) => issue.id)).not.toContain(hiddenLowEvidence.id)
    expect(page1.hasMore).toBe(true)
    expect(page1.limit).toBe(2)
    expect(page1.offset).toBe(0)

    const page2 = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        return yield* repository.list({
          projectId: ProjectId(listTestProjectId),
          limit: 2,
          offset: 2,
        })
      }).pipe(makeProvider(database)),
    )

    expect(page2.items.map((issue) => issue.id)).toEqual([older.id])
    expect(page2.hasMore).toBe(false)
  })

  it("can lock an issue row by id inside a transaction", async () => {
    const issue = makeSignal()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        yield* repository.save(issue)
      }).pipe(withPostgres(SignalRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    const lockedSignal = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        const sqlClient = yield* SqlClient

        return yield* sqlClient.transaction(repository.findByIdForUpdate(issue.id))
      }).pipe(withPostgres(SignalRepositoryLive, database.appPostgresClient, OrganizationId(organizationId))),
    )

    expect(lockedSignal).toEqual(issue)
  })

  describe("lifecycle JOIN", () => {
    it("findById attaches isEscalating=true when an open issue.escalating row exists", async () => {
      const issue = makeSignal()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-esc-open-aaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: null,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isEscalating).toBe(true)
      expect(result.lifecycle.isRegressed).toBe(false)
    })

    it("findById attaches isEscalating=false when the escalating row is closed", async () => {
      const issue = makeSignal()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-esc-clos-aaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: new Date("2026-04-16T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isEscalating).toBe(false)
    })

    it("findById attaches isRegressed=true when an unresolved issue has a regressed incident", async () => {
      const issue = makeSignal()

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      await database.db.insert(alertIncidentsTable).values({
        id: "ai-reg-row-aaaaaaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.regressed",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: new Date("2026-04-15T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isRegressed).toBe(true)
    })

    it("findById attaches isRegressed=false when the issue has been resolved again after regressing", async () => {
      const issue = makeSignal({ resolvedAt: new Date("2026-04-20T00:00:00.000Z") })

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* repository.save(issue)
        }).pipe(makeProvider(database)),
      )

      // Historical regression incident is preserved in the table, but
      // `isRegressed` should clear because the issue was resolved again.
      await database.db.insert(alertIncidentsTable).values({
        id: "ai-reg-resolved-aaaaaaaa",
        organizationId,
        projectId: issue.projectId,
        sourceType: "issue",
        sourceId: issue.id,
        kind: "issue.regressed",
        severity: "high",
        startedAt: new Date("2026-04-15T00:00:00.000Z"),
        endedAt: new Date("2026-04-15T00:00:00.000Z"),
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          return yield* repository.findById(issue.id)
        }).pipe(makeProvider(database)),
      )

      expect(result.lifecycle.isRegressed).toBe(false)
    })

    it("list and findByIds populate the same lifecycle flags as findById", async () => {
      const escalatingSignal = makeSignal()
      const regressedSignal = makeSignal({
        id: otherSignalId,
        name: "Incorrect refusal",
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          yield* repository.save(escalatingSignal)
          yield* repository.save(regressedSignal)
        }).pipe(makeProvider(database)),
      )

      // Add three annotation scores to each issue so they pass the
      // visibility threshold in `list`.
      const baseDate = new Date("2026-04-15T00:00:00.000Z")
      for (const target of [escalatingSignal, regressedSignal]) {
        for (let index = 0; index < 3; index++) {
          await database.db.insert(scoresTable).values(
            makeAnnotationScoreRow({
              id: `${target.id.slice(0, 6)}score${index}`.padEnd(24, "x"),
              projectId: target.projectId,
              signalId: target.id,
              createdAt: baseDate,
            }),
          )
        }
      }

      await database.db.insert(alertIncidentsTable).values([
        {
          id: "ai-esc-list-aaaaaaaaaaaa",
          organizationId,
          projectId: escalatingSignal.projectId,
          sourceType: "issue",
          sourceId: escalatingSignal.id,
          kind: "issue.escalating",
          severity: "high",
          startedAt: baseDate,
          endedAt: null,
        },
        {
          id: "ai-reg-list-aaaaaaaaaaaa",
          organizationId,
          projectId: regressedSignal.projectId,
          sourceType: "issue",
          sourceId: regressedSignal.id,
          kind: "issue.regressed",
          severity: "high",
          startedAt: baseDate,
          endedAt: null,
        },
      ])

      const { listResult, findByIdsResult } = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* SignalRepository
          const listResult = yield* repository.list({ projectId, limit: 50, offset: 0 })
          const findByIdsResult = yield* repository.findByIds({
            projectId,
            signalIds: [escalatingSignal.id, regressedSignal.id],
          })
          return { listResult, findByIdsResult }
        }).pipe(makeProvider(database)),
      )

      const listFlags = new Map(listResult.items.map((item) => [item.id, item.lifecycle] as const))
      expect(listFlags.get(escalatingSignal.id)).toEqual({ isEscalating: true, isRegressed: false })
      expect(listFlags.get(regressedSignal.id)).toEqual({ isEscalating: false, isRegressed: true })

      const findByIdsFlags = new Map(findByIdsResult.map((item) => [item.id, item.lifecycle] as const))
      expect(findByIdsFlags.get(escalatingSignal.id)).toEqual({ isEscalating: true, isRegressed: false })
      expect(findByIdsFlags.get(regressedSignal.id)).toEqual({ isEscalating: false, isRegressed: true })
    })
  })
})

describe("SignalRepositoryLive searchOrgWide", () => {
  let database: InMemoryPostgres

  const iid = (prefix: string) => prefix.padEnd(24, "x").slice(0, 24)

  // Signal reads go through `signalSchema.parse`, which requires 24-char cuid ids — pad org/project ids.
  const searchOrgId = OrganizationId(iid("org-issue-search-test"))
  const otherOrgId = OrganizationId(iid("org-issue-search-othr"))
  const projA = ProjectId(iid("proj-issue-search-a"))
  const projB = ProjectId(iid("proj-issue-search-b"))
  const projDeleted = ProjectId(iid("proj-issue-search-del"))
  const projOther = ProjectId(iid("proj-issue-search-oth"))
  const baseTime = new Date("2026-04-01T00:00:00.000Z")

  const signalRow = (
    id: string,
    org: OrganizationId,
    project: ProjectId,
    name: string,
    extra: Partial<typeof signalsTable.$inferInsert> = {},
  ): typeof signalsTable.$inferInsert => ({
    id: iid(id),
    organizationId: org,
    projectId: project,
    slug: toSlug(name),
    name,
    description: `Description for ${name}`,
    source: "annotation",
    centroid: createSignalCentroid(),
    centroidEmbedding: null,
    clusteredAt: baseTime,
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: baseTime,
    updatedAt: baseTime,
    ...extra,
  })

  const search = (input: {
    readonly query: string
    readonly normalizedEmbedding?: readonly number[]
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.searchOrgWide(input)
      }).pipe(withPostgres(SignalRepositoryLive, database.appPostgresClient, searchOrgId)),
    )

  beforeAll(async () => {
    database = await createInMemoryPostgres()

    await database.db.insert(projectsTable).values([
      { id: projA, organizationId: searchOrgId, name: "Alpha Project", slug: "iss-alpha" },
      { id: projB, organizationId: searchOrgId, name: "Beta Project", slug: "iss-beta" },
      { id: projDeleted, organizationId: searchOrgId, name: "Gone Project", slug: "iss-gone", deletedAt: baseTime },
      { id: projOther, organizationId: otherOrgId, name: "Other Org Project", slug: "iss-other" },
    ])

    // Lexical signals (no embedding) across two live projects, a deleted project, and another org.
    await database.db
      .insert(signalsTable)
      .values([
        signalRow("isl1", searchOrgId, projA, "Payment timeout errors"),
        signalRow("isl2", searchOrgId, projB, "Checkout timeout"),
        signalRow("isl3", searchOrgId, projA, "Unrelated latency"),
        signalRow("isl4", searchOrgId, projDeleted, "Timeout in deleted project"),
        signalRow("isl5", otherOrgId, projOther, "Timeout secret"),
        signalRow("isl6", searchOrgId, projA, "Resolved timeout", { resolvedAt: baseTime }),
        signalRow("isl7", searchOrgId, projB, "Ignored timeout", { ignoredAt: baseTime }),
      ])

    // Semantic signals: identical 1-hot embedding in two live projects + one in another org. The
    // centroid must have positive mass + the right model to satisfy the embedding consistency check.
    const sharedEmbedding = makeEmbedding({ 0: 1 })
    const embeddedCentroid = { ...createSignalCentroid(), base: sharedEmbedding, mass: 1 }
    const embedded = { centroid: embeddedCentroid, centroidEmbedding: sharedEmbedding }
    await database.db
      .insert(signalsTable)
      .values([
        signalRow("ise1", searchOrgId, projA, "Zeta alpha", embedded),
        signalRow("ise2", searchOrgId, projB, "Zeta beta", embedded),
        signalRow("ise3", otherOrgId, projOther, "Zeta secret", embedded),
        signalRow("ise4", searchOrgId, projA, "Zeta resolved", { ...embedded, resolvedAt: baseTime }),
        signalRow("ise5", searchOrgId, projB, "Zeta ignored", { ...embedded, ignoredAt: baseTime }),
      ])
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  describe("lexical tier (no embedding)", () => {
    it("matches across projects and tags each hit with its project", async () => {
      const results = await search({ query: "timeout", limit: 25 })
      const byName = new Map(results.map((r) => [r.issue.name, r]))
      expect(byName.has("Payment timeout errors")).toBe(true)
      expect(byName.has("Checkout timeout")).toBe(true)
      expect(byName.get("Payment timeout errors")).toMatchObject({
        projectSlug: "iss-alpha",
        projectName: "Alpha Project",
      })
      expect(byName.get("Checkout timeout")).toMatchObject({ projectSlug: "iss-beta", projectName: "Beta Project" })
    })

    it("excludes archived signals, signals in deleted projects, and other organizations", async () => {
      const results = await search({ query: "timeout", limit: 25 })
      const names = results.map((r) => r.issue.name)
      expect(names).not.toContain("Resolved timeout")
      expect(names).not.toContain("Ignored timeout")
      expect(names).not.toContain("Timeout in deleted project")
      expect(names).not.toContain("Timeout secret")
      expect(names).not.toContain("Unrelated latency")
    })

    it("respects the limit", async () => {
      const results = await search({ query: "timeout", limit: 1 })
      expect(results).toHaveLength(1)
    })

    it("ranks the preferred project's signals first within the tier", async () => {
      const results = await search({ query: "timeout", preferProjectId: projB, limit: 25 })
      const names = results.map((r) => r.issue.name)
      // "Checkout timeout" lives in project B; preferring B floats it ahead of project A's match.
      expect(names.indexOf("Checkout timeout")).toBeLessThan(names.indexOf("Payment timeout errors"))
      expect(results[0]?.issue.projectId).toBe(projB)
    })
  })

  describe("semantic tier (embedding)", () => {
    it("matches by embedding across projects and excludes archived signals and other orgs", async () => {
      const results = await search({ query: "zeta", normalizedEmbedding: makeEmbedding({ 0: 1 }), limit: 25 })
      const names = results.map((r) => r.issue.name)
      expect(names).toContain("Zeta alpha")
      expect(names).toContain("Zeta beta")
      expect(names).not.toContain("Zeta resolved")
      expect(names).not.toContain("Zeta ignored")
      expect(names).not.toContain("Zeta secret")
      expect(new Set(results.filter((r) => r.issue.name.startsWith("Zeta")).map((r) => r.issue.projectId)).size).toBe(2)
    })
  })
})
