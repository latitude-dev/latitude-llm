import { createFakeAI } from "@domain/ai/testing"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import {
  type EvaluationSettings,
  ExternalUserId,
  type FilterSet,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import {
  MessageEmbeddingRepository,
  type Session,
  SessionRepository,
  type Span,
  SpanRepository,
  type TraceDetail,
  TraceRepository,
  TraceSearchRepository,
} from "@domain/spans"
import {
  createFakeMessageEmbeddingRepository,
  createFakeSessionRepository,
  createFakeSpanRepository,
  createFakeTraceRepository,
  createFakeTraceSearchRepository,
  stubListSpan,
} from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { previewEvaluationUseCase } from "./preview-evaluation.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)

const ruleEvaluation: { settings: EvaluationSettings } = {
  settings: { kind: "rule", match: "all", conditions: [{ type: "error" }] },
}

const makeSession = (sessionId: string, traceIds: readonly string[]): Session => ({
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  sessionId: SessionId(sessionId),
  traceCount: traceIds.length,
  traceIds,
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  lastActivityTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1,
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
  userId: ExternalUserId("user"),
  userEmail: "",
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  agentNames: [],
  definedTools: [],
  rootSpanId: "",
  rootSpanName: "",
})

const makeTraceDetail = (traceId: string, sessionId: string): TraceDetail => ({
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  traceId: TraceId(traceId),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1,
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
  sessionId: SessionId(sessionId),
  userId: ExternalUserId("user"),
  userEmail: "",
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  agentNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [{ role: "assistant", parts: [{ type: "text", content: "done" }] }],
})

const makeSpan = (traceId: string): Span =>
  stubListSpan({
    organizationId: OrganizationId(organizationId),
    projectId: ProjectId(projectId),
    traceId: TraceId(traceId),
    sessionId: SessionId("session"),
    spanId: SpanId("s".repeat(16)),
    operation: "chat",
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  })

const buildLayer = (input: {
  readonly sessions: readonly Session[]
  readonly listSpy?: (filters: FilterSet | undefined) => void
  readonly scriptRuntimeLayer?: ReturnType<typeof createFakeScriptRuntime>["layer"]
  /** When true, the session has both occurrences and vectors, so a semantic eval runs instead of skipping. */
  readonly withEmbeddings?: boolean
  /** Spans backing the loaded session; needed so a semantic eval sees non-empty session traces. */
  readonly spans?: readonly Span[]
}) =>
  Layer.mergeAll(
    Layer.succeed(
      SessionRepository,
      createFakeSessionRepository({
        listByProjectId: ({ options }) => {
          input.listSpy?.(options.filters)
          return Effect.succeed({ items: input.sessions, hasMore: false })
        },
      }).repository,
    ),
    Layer.succeed(
      SpanRepository,
      createFakeSpanRepository({ listBySessionId: () => Effect.succeed(input.spans ?? []) }).repository,
    ),
    Layer.succeed(
      TraceRepository,
      createFakeTraceRepository({
        findByTraceId: ({ traceId }) => Effect.succeed(makeTraceDetail(traceId as string, "session")),
      }).repository,
    ),
    Layer.succeed(
      MessageEmbeddingRepository,
      createFakeMessageEmbeddingRepository({
        findByHashes: ({ contentHashes, embeddingModel }) =>
          Effect.succeed(
            input.withEmbeddings
              ? contentHashes.map((contentHash) => ({
                  organizationId: OrganizationId(organizationId),
                  projectId: ProjectId(projectId),
                  contentHash,
                  embedding: [1, 0, 0],
                  embeddingModel: embeddingModel ?? "voyage-4-large",
                  insertedAt: new Date(0),
                }))
              : [],
          ),
      }).repository,
    ),
    Layer.succeed(
      TraceSearchRepository,
      createFakeTraceSearchRepository({
        listMessageOccurrencesForTraces: () =>
          Effect.succeed(input.withEmbeddings ? [{ contentHash: "hash-a", role: "user" as const }] : []),
      }).repository,
    ),
    createFakeAI().layer,
    input.scriptRuntimeLayer ?? createFakeScriptRuntime().layer,
  )

describe("previewEvaluationUseCase", () => {
  it("maps a verdict row per matching session (default fake run = passed)", async () => {
    const sessions = [makeSession("s1", ["t1".padEnd(32, "1")]), makeSession("s2", ["t2".padEnd(32, "2")])]

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: ruleEvaluation }).pipe(
        Effect.provide(buildLayer({ sessions })),
      ),
    )

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ sessionId: "s1", passed: true, value: 1, error: null })
    expect(result.items[1]).toMatchObject({ sessionId: "s2", passed: true, error: null })
    // Each row carries the session summary (metrics) so the preview is recognizable.
    expect(result.items[0]?.summary).not.toBeNull()
    expect(typeof result.items[0]?.summary?.tokensTotal).toBe("number")
  })

  it("skips sessions with no traces", async () => {
    const sessions = [makeSession("with-trace", ["t1".padEnd(32, "1")]), makeSession("empty", [])]

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: ruleEvaluation }).pipe(
        Effect.provide(buildLayer({ sessions })),
      ),
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.sessionId).toBe("with-trace")
  })

  it("captures a per-session run error without failing the whole preview", async () => {
    let call = 0
    const failingRuntime = createFakeScriptRuntime({
      run: () => {
        call += 1
        return call === 1
          ? Effect.fail({ _tag: "ScriptRunError", message: "boom" } as never)
          : Effect.succeed({ value: 1, duration: 0, tokens: 0, cost: 0 })
      },
    })
    const sessions = [makeSession("s1", ["t1".padEnd(32, "1")]), makeSession("s2", ["t2".padEnd(32, "2")])]

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: ruleEvaluation }).pipe(
        Effect.provide(buildLayer({ sessions, scriptRuntimeLayer: failingRuntime.layer })),
      ),
    )

    expect(result.items).toHaveLength(2)
    expect(result.items.filter((r) => r.error !== null)).toHaveLength(1)
    expect(result.items.filter((r) => r.passed === true)).toHaveLength(1)
  })

  const semanticEvaluation = { script: "return Passed((await semanticSimilarity('frustration')) >= 0.5 ? 1 : 0)" }

  it("skips a semantic eval (never runs it) when the session has no embeddings", async () => {
    const traceId = "t1".padEnd(32, "1")
    const sessions = [makeSession("s1", [traceId])]
    const runtime = createFakeScriptRuntime({
      run: () => Effect.die("Script must not run when the session has no embeddings"),
    })

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: semanticEvaluation }).pipe(
        Effect.provide(buildLayer({ sessions, scriptRuntimeLayer: runtime.layer, spans: [makeSpan(traceId)] })),
      ),
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ sessionId: "s1", skipped: true, passed: null, value: null, error: null })
    // The row still carries the session summary so it's recognizable in the preview.
    expect(result.items[0]?.summary).not.toBeNull()
  })

  it("runs a semantic eval when the session's embeddings are present", async () => {
    const traceId = "t1".padEnd(32, "1")
    const sessions = [makeSession("s1", [traceId])]

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: semanticEvaluation }).pipe(
        Effect.provide(buildLayer({ sessions, withEmbeddings: true, spans: [makeSpan(traceId)] })),
      ),
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ sessionId: "s1", skipped: false, passed: true })
  })

  it("passes the supplied filters through to the session query", async () => {
    const filters: FilterSet = { status: [{ op: "in", value: ["error"] }] }
    let received: FilterSet | undefined

    await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: ruleEvaluation, filters }).pipe(
        Effect.provide(buildLayer({ sessions: [], listSpy: (f) => (received = f) })),
      ),
    )

    expect(received).toEqual(filters)
  })

  it("evaluates the supplied traceIds and does not query the latest sessions", async () => {
    let listed = false
    const traceIds = ["ta".padEnd(32, "a"), "tb".padEnd(32, "b")]

    const result = await Effect.runPromise(
      previewEvaluationUseCase({ organizationId, projectId, evaluation: ruleEvaluation, traceIds }).pipe(
        Effect.provide(buildLayer({ sessions: [], listSpy: () => (listed = true) })),
      ),
    )

    expect(listed).toBe(false)
    expect(result.items.map((row) => row.traceId)).toEqual(traceIds)
    expect(result.items.every((row) => row.passed === true)).toBe(true)
  })
})
