import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  ExternalUserId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { Trace, TraceDetail, TraceListPage } from "@domain/spans"
import { SpanRepository, TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { submitApiAnnotationUseCase } from "./submit-api-annotation.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const traceIdRaw = "d".repeat(32)
const defaultResolvedSpanId = SpanId("s".repeat(16))

const traceDetailStub = (traceId: string): TraceDetail => ({
  organizationId: OrganizationId(cuid),
  projectId: ProjectId(projectCuid),
  traceId: TraceId(traceId),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-03-24T00:00:00.000Z"),
  endTime: new Date("2026-03-24T00:01:00.000Z"),
  durationNs: 0,
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
  sessionId: SessionId("session"),
  userId: ExternalUserId("user"),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [],
})

const traceStub = (traceId: string): Trace => ({
  organizationId: OrganizationId(cuid),
  projectId: ProjectId(projectCuid),
  traceId: TraceId(traceId),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-03-24T00:00:00.000Z"),
  endTime: new Date("2026-03-24T00:01:00.000Z"),
  durationNs: 0,
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
  sessionId: SessionId("session"),
  userId: ExternalUserId("user"),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
})

const defaultCompletionSpan = (traceId = traceIdRaw) =>
  stubListSpan({
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId: TraceId(traceId),
    sessionId: SessionId("session"),
    spanId: defaultResolvedSpanId,
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  })

const createTestLayers = (options?: {
  traceRepositoryOverrides?: Partial<TraceRepositoryShape>
  traceDetailForFindByTraceId?: TraceDetail | null
}) => {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const traceDetailForLookup =
    options?.traceDetailForFindByTraceId === undefined
      ? traceDetailStub(traceIdRaw)
      : options.traceDetailForFindByTraceId

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => {
      if (traceDetailForLookup === null) {
        return Effect.fail(new NotFoundError({ entity: "Trace", id: "" }))
      }
      return Effect.succeed(traceDetailForLookup)
    },
    // By default, treat the caller-supplied traceId as belonging to the project.
    // Tests that exercise cross-tenant rejection override this to `false`.
    matchesFiltersByTraceId: () => Effect.succeed(true),
    ...options?.traceRepositoryOverrides,
  })

  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([defaultCompletionSpan()]),
  })

  return {
    store,
    events,
    layer: Layer.mergeAll(
      Layer.succeed(ScoreRepository, scoreRepository),
      Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
      Layer.succeed(OutboxEventWriter, {
        write: (event) =>
          Effect.sync(() => {
            events.push(event)
          }),
      }),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(cuid) })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(cuid) })),
      Layer.succeed(TraceRepository, traceRepository),
      Layer.succeed(SpanRepository, spanRepository),
    ),
  }
}

describe("submitApiAnnotationUseCase", () => {
  describe("trace resolution", () => {
    it("resolves trace by id and persists the annotation", async () => {
      const { store, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiAnnotationUseCase({
          trace: { by: "id", id: traceIdRaw },
          value: 0.5,
          passed: true,
          feedback: "Good answer",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(score.traceId).toBe(TraceId(traceIdRaw))
      expect(store.size).toBe(1)
    })

    it("rejects a trace id that does not belong to the caller's project with NotFoundError", async () => {
      const { store, layer } = createTestLayers({
        traceRepositoryOverrides: {
          matchesFiltersByTraceId: () => Effect.succeed(false),
        },
      })

      const exit = await Effect.runPromiseExit(
        submitApiAnnotationUseCase({
          trace: { by: "id", id: traceIdRaw },
          value: 0.5,
          passed: true,
          feedback: "Should not persist — trace belongs to a different project",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const serialized = JSON.stringify(exit.cause)
        expect(serialized).toContain("NotFoundError")
        // The error message must carry the offending trace id so the caller
        // can diagnose the cross-tenant miss from the response alone.
        expect(serialized).toContain(traceIdRaw)
      }
      expect(store.size).toBe(0)
    })

    it("resolves trace by filter when exactly one trace matches", async () => {
      const { store, layer } = createTestLayers({
        traceRepositoryOverrides: {
          listByProjectId: () =>
            Effect.succeed<TraceListPage>({
              items: [traceStub(traceIdRaw)],
              hasMore: false,
            }),
        },
      })

      const score = await Effect.runPromise(
        submitApiAnnotationUseCase({
          trace: {
            by: "filters",
            filters: { "attributes.scoreId": [{ op: "eq", value: "some-score-id" }] },
          },
          value: 0.5,
          passed: true,
          feedback: "Resolved by filter",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(score.traceId).toBe(TraceId(traceIdRaw))
      expect(store.size).toBe(1)
    })

    it("fails with NotFoundError when no trace matches the filters", async () => {
      const { layer } = createTestLayers({
        traceRepositoryOverrides: {
          listByProjectId: () => Effect.succeed<TraceListPage>({ items: [], hasMore: false }),
        },
      })

      const exit = await Effect.runPromiseExit(
        submitApiAnnotationUseCase({
          trace: {
            by: "filters",
            filters: { "attributes.scoreId": [{ op: "eq", value: "no-match" }] },
          },
          value: 0.5,
          passed: true,
          feedback: "Should not persist",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const serialized = JSON.stringify(exit.cause)
        expect(serialized).toContain("NotFoundError")
        // The message must explain *why* we failed, not just "Trace not found".
        expect(serialized).toContain("No trace in this project matches the provided filters")
      }
    })

    it("fails with BadRequestError when multiple traces match the filters", async () => {
      const otherTraceId = "e".repeat(32)
      const { layer } = createTestLayers({
        traceRepositoryOverrides: {
          listByProjectId: () =>
            Effect.succeed<TraceListPage>({
              items: [traceStub(traceIdRaw), traceStub(otherTraceId)],
              hasMore: false,
            }),
        },
      })

      const exit = await Effect.runPromiseExit(
        submitApiAnnotationUseCase({
          trace: {
            by: "filters",
            filters: { "attributes.scoreId": [{ op: "eq", value: "ambiguous" }] },
          },
          value: 0.5,
          passed: true,
          feedback: "Should not persist",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const serialized = JSON.stringify(exit.cause)
        expect(serialized).toContain("BadRequestError")
        // The message must explain *why* we failed (ambiguity) and how to fix
        // it (refine filters), not just a generic 400.
        expect(serialized).toContain("more than one trace")
        expect(serialized).toContain("Refine the filter set")
      }
    })
  })

  describe("publication", () => {
    it("always writes a published annotation (draftedAt=null) — the public API does not expose draft state", async () => {
      const { store, events, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiAnnotationUseCase({
          trace: { by: "id", id: traceIdRaw },
          value: 0.5,
          passed: true,
          feedback: "Always published",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      expect(score.draftedAt).toBeNull()
      expect(store.size).toBe(1)
      expect(events).toEqual([
        expect.objectContaining({
          eventName: "ScoreCreated",
          payload: expect.objectContaining({ status: "published" }),
        }),
      ])
    })
  })

  describe("sourceId", () => {
    it('always persists with sourceId="API" regardless of caller', async () => {
      const { store, layer } = createTestLayers()

      await Effect.runPromise(
        submitApiAnnotationUseCase({
          trace: { by: "id", id: traceIdRaw },
          value: 0.5,
          passed: true,
          feedback: "Has sourceId",
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        }).pipe(Effect.provide(layer)),
      )

      const persisted = Array.from(store.values())[0]
      expect(persisted?.source).toBe("annotation")
      expect(persisted?.sourceId).toBe("API")
    })
  })
})
