import { OutboxEventWriter } from "@domain/events"
import {
  ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import {
  SpanRepository,
  type Trace,
  type TraceDetail,
  type TraceListPage,
  TraceRepository,
  type TraceRepositoryShape,
} from "@domain/spans"
import { createFakeSpanRepository, createFakeTraceRepository, stubListSpan } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { ScoreRepository } from "../ports/score-repository.ts"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "../testing/index.ts"
import { submitApiScoreUseCase } from "./submit-api-score.ts"

const cuid = "a".repeat(24)
const projectCuid = "b".repeat(24)
const evaluationCuid = "c".repeat(24)
const traceIdRaw = "d".repeat(32)
const traceSessionId = SessionId("trace-session")
const resolvedSpanId = SpanId("s".repeat(16))

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
  sessionId: traceSessionId,
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
  sessionId: traceSessionId,
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

const completionSpan = (traceId = traceIdRaw) =>
  stubListSpan({
    organizationId: OrganizationId(cuid),
    projectId: ProjectId(projectCuid),
    traceId: TraceId(traceId),
    sessionId: traceSessionId,
    spanId: resolvedSpanId,
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  })

const createTestLayers = (options?: { traceRepositoryOverrides?: Partial<TraceRepositoryShape> }) => {
  const events: unknown[] = []
  const { repository: scoreRepository, scores: store } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()

  const { repository: traceRepository } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(traceDetailStub(traceIdRaw)),
    // Default: caller-supplied trace id belongs to the project. Cross-tenant
    // rejection is exercised explicitly by overriding to `false`.
    matchesFiltersByTraceId: () => Effect.succeed(true),
    ...options?.traceRepositoryOverrides,
  })

  const { repository: spanRepository } = createFakeSpanRepository({
    listByTraceId: () => Effect.succeed([completionSpan()]),
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

const customInput = (overrides?: Record<string, unknown>) => ({
  source: "custom" as const,
  sourceId: "api-source",
  value: 0.87,
  passed: true,
  feedback: "Custom score",
  organizationId: cuid,
  projectId: ProjectId(projectCuid),
  ...overrides,
})

const evaluationInput = (overrides?: Record<string, unknown>) => ({
  source: "evaluation" as const,
  sourceId: evaluationCuid,
  metadata: { evaluationHash: "sha256:abc123" },
  value: 0.91,
  passed: true,
  feedback: "Evaluation score",
  organizationId: cuid,
  projectId: ProjectId(projectCuid),
  ...overrides,
})

describe("submitApiScoreUseCase", () => {
  describe("trace resolution", () => {
    it("resolves trace by id and persists the score", async () => {
      const { store, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiScoreUseCase(customInput({ trace: { by: "id", id: traceIdRaw } })).pipe(Effect.provide(layer)),
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
        submitApiScoreUseCase(customInput({ trace: { by: "id", id: traceIdRaw } })).pipe(Effect.provide(layer)),
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
        submitApiScoreUseCase(
          customInput({
            trace: {
              by: "filters",
              filters: { "metadata.runId": [{ op: "eq", value: "run-abc" }] },
            },
          }),
        ).pipe(Effect.provide(layer)),
      )

      expect(score.traceId).toBe(TraceId(traceIdRaw))
      expect(store.size).toBe(1)
    })

    it("fails with NotFoundError when no trace matches the filters", async () => {
      const { store, layer } = createTestLayers({
        traceRepositoryOverrides: {
          listByProjectId: () => Effect.succeed<TraceListPage>({ items: [], hasMore: false }),
        },
      })

      const exit = await Effect.runPromiseExit(
        submitApiScoreUseCase(
          customInput({
            trace: {
              by: "filters",
              filters: { "metadata.runId": [{ op: "eq", value: "no-match" }] },
            },
          }),
        ).pipe(Effect.provide(layer)),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const serialized = JSON.stringify(exit.cause)
        expect(serialized).toContain("NotFoundError")
        // The message must explain *why* we failed, not just "Trace not found".
        expect(serialized).toContain("No trace in this project matches the provided filters")
      }
      expect(store.size).toBe(0)
    })

    it("fails with BadRequestError when multiple traces match the filters", async () => {
      const otherTraceId = "e".repeat(32)
      const { store, layer } = createTestLayers({
        traceRepositoryOverrides: {
          listByProjectId: () =>
            Effect.succeed<TraceListPage>({
              items: [traceStub(traceIdRaw), traceStub(otherTraceId)],
              hasMore: false,
            }),
        },
      })

      const exit = await Effect.runPromiseExit(
        submitApiScoreUseCase(
          customInput({
            trace: {
              by: "filters",
              filters: { "metadata.runId": [{ op: "eq", value: "ambiguous" }] },
            },
          }),
        ).pipe(Effect.provide(layer)),
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
      expect(store.size).toBe(0)
    })
  })

  describe("session/span auto-resolution", () => {
    it("lifts sessionId from the trace and pins spanId to the last LLM completion when a trace is provided", async () => {
      const { store, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiScoreUseCase(customInput({ trace: { by: "id", id: traceIdRaw } })).pipe(Effect.provide(layer)),
      )

      expect(score.sessionId).toBe(traceSessionId)
      expect(score.spanId).toBe(resolvedSpanId)
      const persisted = Array.from(store.values())[0]
      expect(persisted?.sessionId).toBe(traceSessionId)
      expect(persisted?.spanId).toBe(resolvedSpanId)
    })

    it("does not call the trace repository when no trace ref is provided", async () => {
      let findByTraceIdCalls = 0
      let listByProjectIdCalls = 0
      const { layer } = createTestLayers({
        traceRepositoryOverrides: {
          findByTraceId: () => {
            findByTraceIdCalls++
            return Effect.succeed(traceDetailStub(traceIdRaw))
          },
          listByProjectId: () => {
            listByProjectIdCalls++
            return Effect.succeed<TraceListPage>({ items: [], hasMore: false })
          },
        },
      })

      await Effect.runPromise(submitApiScoreUseCase(customInput()).pipe(Effect.provide(layer)))

      expect(findByTraceIdCalls).toBe(0)
      expect(listByProjectIdCalls).toBe(0)
    })
  })

  describe("uninstrumented scores", () => {
    it("persists with null trace/session/span when the trace ref is omitted", async () => {
      const { store, layer } = createTestLayers()

      const score = await Effect.runPromise(submitApiScoreUseCase(customInput()).pipe(Effect.provide(layer)))

      expect(score.traceId).toBeNull()
      expect(score.sessionId).toBeNull()
      expect(score.spanId).toBeNull()
      expect(store.size).toBe(1)
    })
  })

  describe("source variants", () => {
    it("persists a custom score and emits ScoreCreated", async () => {
      const { store, events, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiScoreUseCase(customInput({ trace: { by: "id", id: traceIdRaw } })).pipe(Effect.provide(layer)),
      )

      expect(score.source).toBe("custom")
      expect(score.sourceId).toBe("api-source")
      expect(store.size).toBe(1)
      expect(events).toEqual([
        expect.objectContaining({
          eventName: "ScoreCreated",
          payload: expect.objectContaining({ status: "published" }),
        }),
      ])
    })

    it("persists an evaluation score with required evaluationHash metadata", async () => {
      const { store, layer } = createTestLayers()

      const score = await Effect.runPromise(
        submitApiScoreUseCase(evaluationInput({ trace: { by: "id", id: traceIdRaw } })).pipe(Effect.provide(layer)),
      )

      expect(score.source).toBe("evaluation")
      expect(score.sourceId).toBe(evaluationCuid)
      expect(score.metadata).toEqual({ evaluationHash: "sha256:abc123" })
      expect(store.size).toBe(1)
    })
  })

  describe("validation", () => {
    it("rejects a payload missing required fields with BadRequestError", async () => {
      const { layer } = createTestLayers()

      const exit = await Effect.runPromiseExit(
        // Missing `feedback` — a required field. Cast through unknown so the
        // test exercises the runtime parse rather than relying on a TS error.
        submitApiScoreUseCase({
          source: "custom",
          sourceId: "api-source",
          value: 0.5,
          passed: true,
          organizationId: cuid,
          projectId: ProjectId(projectCuid),
        } as unknown as Parameters<typeof submitApiScoreUseCase>[0]).pipe(Effect.provide(layer)),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(JSON.stringify(exit.cause)).toContain("BadRequestError")
      }
    })
  })
})
