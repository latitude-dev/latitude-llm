import { NotFoundError, OrganizationId, ProjectId, SessionId, type SqlClient, TraceId } from "@domain/shared"
import {
  createTraceDeletionRequest,
  markTraceDeletionCompleted,
  TraceDeletionRequestRepository,
  TraceReferencePurgeRepository,
} from "@domain/spans"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { annotationQueueItems, annotationQueues } from "../schema/annotation-queues.ts"
import { scores } from "../schema/scores.ts"
import { traceDeletionRequests } from "../schema/trace-deletion-requests.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { TraceDeletionRequestRepositoryLive } from "./trace-deletion-request-repository.ts"
import { TraceReferencePurgeRepositoryLive } from "./trace-reference-purge-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const PURGED_TRACE = TraceId("1".repeat(32))
const KEPT_TRACE = TraceId("2".repeat(32))
const SESSION = SessionId("session-1")

const pg = setupTestPostgres()

const run = <A, E>(
  effect: Effect.Effect<A, E, TraceDeletionRequestRepository | TraceReferencePurgeRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) =>
  Effect.runPromise(
    effect.pipe(
      withPostgres(
        Layer.mergeAll(TraceDeletionRequestRepositoryLive, TraceReferencePurgeRepositoryLive),
        pg.adminPostgresClient,
        org,
      ),
    ),
  )

const makeRequest = (createdAt: Date) => ({
  ...createTraceDeletionRequest({
    organizationId: ORG_A,
    projectId: PROJECT,
    filters: { tags: [{ op: "contains", value: "customer:acme" }] },
    requestedBy: { type: "user", id: "u".repeat(24) },
  }),
  createdAt,
})

afterEach(async () => {
  await pg.db.delete(traceDeletionRequests)
  await pg.db.delete(scores)
  await pg.db.delete(annotationQueueItems)
  await pg.db.delete(annotationQueues)
})

describe("TraceDeletionRequestRepository", () => {
  it("round-trips a request and its receipt", async () => {
    const request = makeRequest(new Date("2026-10-01T00:00:00.000Z"))
    const completed = markTraceDeletionCompleted(request, {
      matchedTraceCount: 3,
      deletedRowCounts: { "clickhouse.spans": 12 },
    })

    const found = await run(
      Effect.gen(function* () {
        const repository = yield* TraceDeletionRequestRepository
        yield* repository.save(request)
        yield* repository.save(completed)
        return yield* repository.findById(request.id)
      }),
    )

    expect(found).toMatchObject({
      id: request.id,
      status: "completed",
      filters: request.filters,
      requestedBy: request.requestedBy,
      matchedTraceCount: 3,
      deletedRowCounts: { "clickhouse.spans": 12 },
    })
  })

  it("pages newest first and hides other organizations' requests", async () => {
    const oldest = makeRequest(new Date("2026-10-01T00:00:00.000Z"))
    const middle = makeRequest(new Date("2026-10-02T00:00:00.000Z"))
    const newest = makeRequest(new Date("2026-10-03T00:00:00.000Z"))
    await run(
      Effect.gen(function* () {
        const repository = yield* TraceDeletionRequestRepository
        for (const request of [oldest, middle, newest]) yield* repository.save(request)
      }),
    )

    const [first, second] = await run(
      Effect.gen(function* () {
        const repository = yield* TraceDeletionRequestRepository
        const page = yield* repository.listByProjectId({ projectId: PROJECT, limit: 2 })
        const next = yield* repository.listByProjectId({ projectId: PROJECT, limit: 2, cursor: page.nextCursor ?? "" })
        return [page, next] as const
      }),
    )
    const otherOrg = await run(
      Effect.gen(function* () {
        const repository = yield* TraceDeletionRequestRepository
        return yield* repository.findById(oldest.id).pipe(Effect.flip)
      }),
      ORG_B,
    )

    expect(first.items.map((item) => item.id)).toEqual([newest.id, middle.id])
    expect(second.items.map((item) => item.id)).toEqual([oldest.id])
    expect(second.nextCursor).toBeNull()
    expect(otherOrg).toBeInstanceOf(NotFoundError)
  })
})

describe("TraceReferencePurgeRepository", () => {
  const score = (id: string, overrides: Partial<typeof scores.$inferInsert>) => ({
    id: id.repeat(24),
    organizationId: ORG_A,
    projectId: PROJECT,
    sourceType: "annotation" as const,
    sourceId: "source",
    value: 0,
    passed: false,
    feedback: `feedback ${id}`,
    metadata: {},
    errored: false,
    ...overrides,
  })

  it("deletes trace-level and session-level scores, queue items, and recounts the queues", async () => {
    await pg.db
      .insert(scores)
      .values([
        score("a", { traceId: PURGED_TRACE, sessionId: SESSION, signalId: "s".repeat(24) }),
        score("b", { traceId: null, sessionId: SESSION }),
        score("c", { traceId: KEPT_TRACE, sessionId: SESSION }),
        score("d", { traceId: PURGED_TRACE, organizationId: ORG_B }),
      ])
    await pg.db.insert(annotationQueues).values({
      id: "q".repeat(24),
      organizationId: ORG_A,
      projectId: PROJECT,
      name: "Queue",
      slug: "queue",
      description: "",
      instructions: "",
      settings: {},
      assignees: [],
      totalItems: 2,
      completedItems: 1,
    })
    await pg.db.insert(annotationQueueItems).values([
      {
        id: "i".repeat(24),
        organizationId: ORG_A,
        projectId: PROJECT,
        queueId: "q".repeat(24),
        traceId: PURGED_TRACE,
        traceCreatedAt: new Date(),
        completedAt: new Date(),
      },
      {
        id: "j".repeat(24),
        organizationId: ORG_A,
        projectId: PROJECT,
        queueId: "q".repeat(24),
        traceId: KEPT_TRACE,
        traceCreatedAt: new Date(),
      },
    ])

    const keys = { projectId: PROJECT, traceIds: [PURGED_TRACE], sessionIds: [SESSION] }
    const [counted, result] = await run(
      Effect.gen(function* () {
        const purge = yield* TraceReferencePurgeRepository
        const counted = yield* purge.count(keys)
        return [counted, yield* purge.purge(keys)] as const
      }),
    )

    expect(counted).toEqual({ scores: 2, annotation_queue_items: 1 })
    expect(result.scores.map((deleted) => deleted.scoreId).sort()).toEqual(["a".repeat(24), "b".repeat(24)])
    expect(result.scores.find((deleted) => deleted.scoreId === "a".repeat(24))).toMatchObject({
      signalId: "s".repeat(24),
      draftedAt: null,
      feedback: "feedback a",
      source: "annotation",
    })
    const remaining = await pg.db.select({ id: scores.id }).from(scores)
    expect(remaining.map((row) => row.id).sort()).toEqual(["c".repeat(24), "d".repeat(24)])
    const [queue] = await pg.db
      .select()
      .from(annotationQueues)
      .where(eq(annotationQueues.id, "q".repeat(24)))
    expect(queue).toMatchObject({ totalItems: 1, completedItems: 0 })
  })

  it("is a no-op without traces or sessions", async () => {
    const result = await run(
      Effect.gen(function* () {
        const purge = yield* TraceReferencePurgeRepository
        const keys = { projectId: PROJECT, traceIds: [], sessionIds: [] }
        return [yield* purge.count(keys), yield* purge.purge(keys)] as const
      }),
    )

    expect(result).toEqual([{}, { scores: [] }])
  })
})
