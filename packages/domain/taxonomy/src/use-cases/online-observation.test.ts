import { AI } from "@domain/ai"
import {
  ChSqlClient,
  DistributedLockRepository,
  DistributedLockUnavailableError,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyClusterId,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import {
  emptyTraceDistribution,
  type SessionDetail,
  SessionRepository,
  type TraceDetail,
  TraceRepository,
} from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { TAXONOMY_EMBEDDING_DIMENSIONS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { createFakeBehaviorObservationRepository } from "../testing/fake-behavior-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { decideClusterAssignmentUseCase } from "./decide-cluster-assignment.ts"
import { recordSessionObservationUseCase } from "./record-session-observation.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const clusterId = TaxonomyClusterId("c".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const embedding = (index: number): number[] => {
  const vector = new Array(TAXONOMY_EMBEDDING_DIMENSIONS).fill(0)
  vector[index] = 1
  return vector
}

const centroidFrom = (value: readonly number[]) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: now },
    embedding: value,
    weight: 1,
    timestamp: now,
    operation: "add",
    previousClusteredAt: now,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeCluster = (): TaxonomyCluster => ({
  id: clusterId,
  organizationId,
  projectId,
  parentCategoryId: null,
  name: "Cancellation",
  description: "Users ask to cancel accounts.",
  centroid: centroidFrom(embedding(0)),
  observationCount: 1,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
})

const makeSession = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  organizationId,
  projectId,
  sessionId,
  traceCount: 1,
  traceIds: ["a".repeat(32)],
  spanCount: 1,
  errorCount: 0,
  startTime: now,
  endTime: new Date("2026-05-24T12:01:00.000Z"),
  lastActivityTime: now,
  durationNs: 60_000_000_000,
  timeToFirstTokenNs: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  userId: ExternalUserId("user-1"),
  simulationId: "",
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: "",
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  lastInputMessages: [
    {
      role: "user",
      parts: [
        {
          type: "text",
          content:
            "I want to cancel my subscription because I no longer use the product. Please explain the exact cancellation steps, whether my billing stops immediately, and how I can confirm the cancellation is complete before the next renewal date.",
        },
      ],
    },
  ],
  outputMessages: [
    {
      role: "assistant",
      parts: [
        {
          type: "text",
          content:
            "I can help with cancellation. Open billing settings, choose manage plan, select cancel plan, confirm the cancellation reason, and check your email for the cancellation confirmation before the next renewal.",
        },
      ],
    },
  ],
  ...overrides,
})

const makeTrace = (
  session: SessionDetail,
  messages = [...session.lastInputMessages, ...session.outputMessages],
): TraceDetail => ({
  ...session,
  traceId: TraceId(session.traceIds[0] ?? "a".repeat(32)),
  allMessages: messages,
})

const makeSessionRepository = (session: SessionDetail | null) =>
  Layer.succeed(SessionRepository, {
    getCohortBaselineByTags: () =>
      Effect.succeed({
        count: 0,
        metrics: {
          costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
        },
      }),
    findBySessionId: () =>
      session ? Effect.succeed(session) : Effect.fail(new NotFoundError({ entity: "Session", id: sessionId })),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed({ totalCount: 0 }),
    aggregateMetricsByProjectId: () =>
      Effect.succeed({
        durationNs: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        costTotalMicrocents: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        spanCount: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        tokensTotal: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        timeToFirstTokenNs: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        traceCount: 0,
      }),
    histogramByProjectId: () => Effect.succeed([]),
    distinctFilterValues: () => Effect.succeed([]),
    getDistribution: () => Effect.succeed(emptyTraceDistribution()),
  })

const makeTraceRepository = (traces: readonly TraceDetail[]) =>
  Layer.succeed(TraceRepository, {
    getCohortBaselineByTags: () =>
      Effect.succeed({
        count: 0,
        metrics: {
          costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
        },
      }),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    findLastTraceAt: () => Effect.succeed(null),
    countAnnotatedByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () =>
      Effect.succeed({
        durationNs: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        costTotalMicrocents: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        spanCount: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        tokensTotal: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
        timeToFirstTokenNs: { min: 0, max: 0, avg: 0, median: 0, sum: 0 },
      }),
    histogramByProjectId: () => Effect.succeed([]),
    findByTraceId: () => Effect.fail(new NotFoundError({ entity: "Trace", id: "missing" })),
    matchesFiltersByTraceId: () => Effect.succeed(false),
    listMatchingFilterIdsByTraceId: () => Effect.succeed([]),
    listByTraceIds: () => Effect.succeed(traces),
    distinctFilterValues: () => Effect.succeed([]),
    getDistribution: () => Effect.succeed({ count: 0, percentileValues: [] }),
  })

const makeAiLayer = (vector: readonly number[], calls: { generate: number } = { generate: 0 }) =>
  Layer.succeed(AI, {
    embed: () => Effect.succeed({ embedding: [...vector] }),
    generate: (input) =>
      Effect.sync(() => {
        calls.generate++
        return {
          object: input.schema.parse({
            summary: "User asked to cancel and the assistant gave cancellation steps.",
            primaryActor: "both",
            intentTags: ["cancellation"],
          }),
          tokens: 1,
          duration: 1,
        }
      }),
    rerank: () => Effect.succeed([]),
  })

describe("online taxonomy observation use-cases", () => {
  it("applies the absolute and relative assignment gates", async () => {
    const cluster = makeCluster()
    const other = { ...cluster, id: TaxonomyClusterId("d".repeat(24)) }

    await expect(
      Effect.runPromise(
        decideClusterAssignmentUseCase({
          topK: [
            { cluster, cosine: 0.9 },
            { cluster: other, cosine: 0.1 },
          ],
        }),
      ),
    ).resolves.toMatchObject({ method: "centroid_online", clusterId })

    await expect(
      Effect.runPromise(
        decideClusterAssignmentUseCase({
          topK: [
            { cluster, cosine: 0.5 },
            { cluster: other, cosine: 0.1 },
          ],
        }),
      ),
    ).resolves.toMatchObject({ method: "noise", clusterId: null })

    await expect(
      Effect.runPromise(
        decideClusterAssignmentUseCase({
          topK: [
            { cluster, cosine: 0.7 },
            { cluster: other, cosine: 0.699 },
          ],
        }),
      ),
    ).resolves.toMatchObject({ method: "noise", clusterId: null })

    await expect(
      Effect.runPromise(
        decideClusterAssignmentUseCase({
          topK: [
            { cluster, cosine: 0.5 },
            { cluster: other, cosine: 0.499 },
          ],
        }),
      ),
    ).resolves.toMatchObject({ method: "noise", clusterId: null })

    await expect(Effect.runPromise(decideClusterAssignmentUseCase({ topK: [] }))).resolves.toMatchObject({
      method: "noise",
      clusterId: null,
      confidence: 0,
    })
  })

  it("skips when the session is missing", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([])
    const locks = createFakeDistributedLockRepository()

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({ organizationId, projectId, sessionId }).pipe(
        Effect.provide(makeSessionRepository(null)),
        Effect.provide(makeTraceRepository([])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "skipped", reason: "session-not-found" })
    expect(observations.rows.size).toBe(0)
  })

  it("records short sessions as cheap noise without embedding", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([])
    const locks = createFakeDistributedLockRepository()
    const shortSession = makeSession({
      traceIds: [],
      lastInputMessages: [{ role: "user", parts: [{ type: "text", content: "hi" }] }],
      outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "hello" }] }],
    })

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({ organizationId, projectId, sessionId }).pipe(
        Effect.provide(makeSessionRepository(shortSession)),
        Effect.provide(makeTraceRepository([])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "recorded", assignmentMethod: "noise", clusterId: null, confidence: 0 })
    expect([...observations.rows.values()][0]?.embedding).toEqual([])
  })

  it("skips empty sessions", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([])
    const locks = createFakeDistributedLockRepository()
    const emptySession = makeSession({ traceIds: [], lastInputMessages: [], outputMessages: [] })

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({ organizationId, projectId, sessionId }).pipe(
        Effect.provide(makeSessionRepository(emptySession)),
        Effect.provide(makeTraceRepository([])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "skipped", reason: "empty-session" })
    expect(observations.rows.size).toBe(0)
  })

  it("uses the LLM summary branch and caches by summary hash", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([])
    const locks = createFakeDistributedLockRepository()
    const calls = { generate: 0 }
    const longText = "I need to cancel my account and understand billing consequences. ".repeat(120)
    const longSession = makeSession({
      traceIds: ["a".repeat(32)],
      lastInputMessages: [{ role: "user", parts: [{ type: "text", content: longText }] }],
      outputMessages: [{ role: "assistant", parts: [{ type: "text", content: longText }] }],
    })
    const effect = recordSessionObservationUseCase({
      organizationId,
      projectId,
      sessionId,
      summaryStrategy: "llm",
    }).pipe(
      Effect.provide(makeSessionRepository(longSession)),
      Effect.provide(makeTraceRepository([makeTrace(longSession)])),
      Effect.provide(makeAiLayer(embedding(0), calls)),
      Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    )

    await Effect.runPromise(effect)
    await Effect.runPromise(effect)

    expect(calls.generate).toBe(1)
    expect([...observations.rows.values()][0]?.summary).toBe(
      "User asked to cancel and the assistant gave cancellation steps.",
    )
  })

  it("records a noise observation during cold start", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([])
    const locks = createFakeDistributedLockRepository()

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({ organizationId, projectId, sessionId }).pipe(
        Effect.provide(makeSessionRepository(makeSession())),
        Effect.provide(makeTraceRepository([makeTrace(makeSession())])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "recorded", assignmentMethod: "noise", clusterId: null, confidence: 0 })
    const row = [...observations.rows.values()][0]
    expect(row?.assignedClusterId).toBeNull()
    expect(row?.embedding).toHaveLength(TAXONOMY_EMBEDDING_DIMENSIONS)
  })

  it("retries short cluster lock contention before assigning to an existing cluster", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])
    let attempts = 0
    const locks = createFakeDistributedLockRepository({
      withLock: <A, E, R>(_input: unknown, effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          attempts++
          if (attempts === 1) {
            return yield* Effect.fail(new DistributedLockUnavailableError({ key: `lock:${clusterId}` }))
          }
          return yield* effect
        }),
    })

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({
        organizationId,
        projectId,
        sessionId,
        triggeringTraceId: TraceId("a".repeat(32)),
        clusterLockRetry: { maxRetries: 1, delayMs: 0 },
      }).pipe(
        Effect.provide(makeSessionRepository(makeSession())),
        Effect.provide(makeTraceRepository([makeTrace(makeSession())])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "recorded", assignmentMethod: "centroid_online", clusterId, confidence: 1 })
    expect(attempts).toBe(2)
    expect([...observations.rows.values()][0]?.assignedClusterId).toBe(clusterId)
    expect(clusters.clusters.get(clusterId)?.observationCount).toBe(2)
  })

  it("records the observation as noise when cluster lock contention outlasts retries", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])
    let attempts = 0
    const locks = createFakeDistributedLockRepository({
      withLock: () =>
        Effect.sync(() => {
          attempts++
        }).pipe(Effect.flatMap(() => Effect.fail(new DistributedLockUnavailableError({ key: `lock:${clusterId}` })))),
    })

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({
        organizationId,
        projectId,
        sessionId,
        triggeringTraceId: TraceId("a".repeat(32)),
        clusterLockRetry: { maxRetries: 0, delayMs: 0 },
      }).pipe(
        Effect.provide(makeSessionRepository(makeSession())),
        Effect.provide(makeTraceRepository([makeTrace(makeSession())])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "recorded", assignmentMethod: "noise", clusterId: null, confidence: 0 })
    expect(attempts).toBe(1)
    const row = [...observations.rows.values()][0]
    expect(row?.assignedClusterId).toBeNull()
    expect(row?.assignmentMethod).toBe("noise")
    expect(row?.embedding).toHaveLength(TAXONOMY_EMBEDDING_DIMENSIONS)
    expect(clusters.clusters.get(clusterId)?.observationCount).toBe(1)
  })

  it("assigns to an existing cluster and updates its centroid/counter", async () => {
    const observations = createFakeBehaviorObservationRepository()
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])
    const locks = createFakeDistributedLockRepository()

    const result = await Effect.runPromise(
      recordSessionObservationUseCase({
        organizationId,
        projectId,
        sessionId,
        triggeringTraceId: TraceId("a".repeat(32)),
      }).pipe(
        Effect.provide(makeSessionRepository(makeSession())),
        Effect.provide(makeTraceRepository([makeTrace(makeSession())])),
        Effect.provide(makeAiLayer(embedding(0))),
        Effect.provide(Layer.succeed(BehaviorObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(DistributedLockRepository, locks.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(result).toEqual({ action: "recorded", assignmentMethod: "centroid_online", clusterId, confidence: 1 })
    const row = [...observations.rows.values()][0]
    expect(row?.assignedClusterId).toBe(clusterId)
    expect(clusters.clusters.get(clusterId)?.observationCount).toBe(2)
  })
})
