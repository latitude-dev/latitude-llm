import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { OutboxEventWriter } from "@domain/events"
import { QueuePublishError } from "@domain/queue"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  CacheStore,
  ChSqlClient,
  ExternalUserId,
  FlaggerId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import type { Flagger } from "../entities/flagger.ts"
import type { FlaggerSlug } from "../flagger-strategies/index.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { type EnqueueFlaggerWorkflowStart, processFlaggersUseCase, type StrategyDecision } from "./process-flaggers.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const TRACE_ID = "c".repeat(32)

// empty-response is deterministic-only: the canonical direct match on this path.
const emptyResponseMessages: TraceDetail["allMessages"] = [
  { role: "user", parts: [{ type: "text", content: "Please help me with this." }] },
  { role: "assistant", parts: [{ type: "text", content: "" }] },
]

const makeTraceDetail = (allMessages: TraceDetail["allMessages"], tags: readonly string[] = []): TraceDetail => ({
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  traceId: TraceId(TRACE_ID),
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
  sessionId: SessionId("session-1"),
  userId: ExternalUserId("user"),
  userEmail: "",
  simulationId: SimulationId(""),
  tags,
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  agentNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: allMessages,
  allMessages,
})

const makeFlagger = (slug: FlaggerSlug, sampling: number, enabled = true): Flagger => ({
  id: FlaggerId(`${slug.padEnd(24, "x").slice(0, 24)}`),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  slug,
  enabled,
  sampling,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const fakeCacheStore = Layer.succeed(CacheStore, {
  get: () => Effect.succeed(null),
  set: () => Effect.void,
  delete: () => Effect.void,
})

interface FakeDeps {
  readonly enqueued: Array<{
    readonly flaggerId: string
    readonly flaggerSlug: string
    readonly reason: "sampled"
  }>
  readonly deps: {
    readonly enqueueWorkflowStart: EnqueueFlaggerWorkflowStart
  }
}

const makeFakeDeps = (): FakeDeps => {
  const enqueued: FakeDeps["enqueued"] = []
  return {
    enqueued,
    deps: {
      enqueueWorkflowStart: (args) =>
        Effect.sync(() => {
          enqueued.push({ flaggerId: args.flaggerId, flaggerSlug: args.flaggerSlug, reason: args.reason })
        }),
    },
  }
}

const runUseCase = async (trace: TraceDetail, flaggers: readonly Flagger[], deps: FakeDeps) => {
  const { repository: traceRepo } = createFakeTraceRepository({
    findByTraceId: () => Effect.succeed(trace),
  })
  const { repository: flaggerRepo } = createFakeFlaggerRepository(flaggers)
  const { repository: scoreRepo, scores } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepo } = createFakeScoreAnalyticsRepository()

  const layer = Layer.mergeAll(
    Layer.succeed(TraceRepository, traceRepo),
    Layer.succeed(FlaggerRepository, flaggerRepo),
    Layer.succeed(ScoreRepository, scoreRepo),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepo),
    Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(ORG_ID) })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(ORG_ID) })),
    fakeCacheStore,
  )

  const result = await Effect.runPromise(
    processFlaggersUseCase({ organizationId: ORG_ID, projectId: PROJECT_ID, traceId: TRACE_ID }, deps.deps).pipe(
      Effect.provide(layer),
    ),
  )

  return { result, scores }
}

const decisionFor = (decisions: readonly StrategyDecision[], slug: string): StrategyDecision | undefined =>
  decisions.find((d) => d.slug === slug)

describe("processFlaggersUseCase (legacy per-trace drain path)", () => {
  let deps: FakeDeps

  beforeEach(() => {
    deps = makeFakeDeps()
  })

  it("skips entirely for a no-reflag trace, even on a deterministic match (recursion break)", async () => {
    const trace = makeTraceDetail(emptyResponseMessages, [
      ...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify,
      ...AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag,
    ])
    const { result, scores } = await runUseCase(trace, [makeFlagger("empty-response", 0)], deps)

    expect(result.decisions).toEqual([])
    expect([...scores.values()]).toEqual([])
    expect(deps.enqueued).toEqual([])
  })

  it("writes a flagger-authored score directly on a deterministic-only match", async () => {
    const trace = makeTraceDetail(emptyResponseMessages)
    const emptyResponseFlagger = makeFlagger("empty-response", 0)
    const { result, scores } = await runUseCase(trace, [emptyResponseFlagger], deps)

    expect(decisionFor(result.decisions, "empty-response")).toEqual({
      slug: "empty-response",
      action: "matched-issue",
    })
    const annotationScores = [...scores.values()].filter(
      (score) => score.sourceType === "annotation" && score.metadata?.flaggerSlug === "empty-response",
    )
    expect(annotationScores).toHaveLength(1)
    expect(annotationScores[0]?.sourceId).toBe("SYSTEM")
    expect(annotationScores[0]?.draftedAt).toBeNull()
    expect(deps.enqueued).toEqual([])
  })

  it("samples LLM-capable unmatched strategies and enqueues sampled-in ones", async () => {
    const trace = makeTraceDetail([{ role: "user", parts: [{ type: "text", content: "Please help me with this." }] }])

    const frustrationFlagger = makeFlagger("frustration", 100)
    const { result } = await runUseCase(trace, [frustrationFlagger], deps)

    expect(decisionFor(result.decisions, "frustration")).toEqual({
      slug: "frustration",
      action: "enqueued",
      reason: "sampled",
    })
    expect(deps.enqueued).toContainEqual({
      flaggerId: frustrationFlagger.id,
      flaggerSlug: "frustration",
      reason: "sampled",
    })
  })

  it("drops unmatched strategies when sampling=0", async () => {
    const trace = makeTraceDetail([{ role: "user", parts: [{ type: "text", content: "Hi." }] }])

    const { result } = await runUseCase(trace, [makeFlagger("frustration", 0)], deps)

    expect(decisionFor(result.decisions, "frustration")).toEqual({
      slug: "frustration",
      action: "dropped",
      reason: "sampled-out",
    })
    expect(deps.enqueued).toEqual([])
  })

  it("never enqueues workflows for deterministic-only strategies", async () => {
    const trace = makeTraceDetail([
      { role: "user", parts: [{ type: "text", content: "Hi." }] },
      { role: "assistant", parts: [{ type: "text", content: "Hello!" }] },
    ])

    const { result } = await runUseCase(trace, [makeFlagger("tool-call-errors", 0)], deps)

    const toolDecision = decisionFor(result.decisions, "tool-call-errors")
    expect(toolDecision?.action).toBe("dropped")
    expect(deps.enqueued.filter((e) => e.flaggerSlug === "tool-call-errors")).toEqual([])
  })

  it("drops every branch when the flagger row is disabled", async () => {
    const trace = makeTraceDetail(emptyResponseMessages)
    const { result, scores } = await runUseCase(trace, [makeFlagger("empty-response", 100, false)], deps)

    expect(decisionFor(result.decisions, "empty-response")).toEqual({
      slug: "empty-response",
      action: "dropped",
      reason: "disabled",
    })
    expect(scores.size).toBe(0)
    expect(deps.enqueued).toEqual([])
  })

  it("drops with reason='missing-flagger' when no flagger row exists for a registered strategy", async () => {
    const trace = makeTraceDetail(emptyResponseMessages)
    const { result } = await runUseCase(trace, [], deps)

    expect(decisionFor(result.decisions, "empty-response")).toEqual({
      slug: "empty-response",
      action: "dropped",
      reason: "missing-flagger",
    })
    expect(deps.enqueued).toEqual([])
  })

  it("emits action: 'failed' (not 'enqueued') when the publisher fails", async () => {
    const failingDeps: FakeDeps = {
      enqueued: [],
      deps: {
        enqueueWorkflowStart: () =>
          Effect.fail(new QueuePublishError({ cause: new Error("boom"), queue: "start-flagger-workflow" })),
      },
    }

    const trace = makeTraceDetail([{ role: "user", parts: [{ type: "text", content: "Please help me with this." }] }])

    const { result } = await runUseCase(trace, [makeFlagger("frustration", 100)], failingDeps)

    expect(decisionFor(result.decisions, "frustration")).toEqual({
      slug: "frustration",
      action: "failed",
    })
    expect(failingDeps.enqueued).toEqual([])
  })

  it("isolates per-strategy failures", async () => {
    const trace = makeTraceDetail([])

    const { result } = await runUseCase(trace, [makeFlagger("frustration", 100)], deps)

    expect(result.decisions.length).toBeGreaterThan(0)
    for (const decision of result.decisions) {
      expect(decision.action).not.toBe("failed")
    }
  })
})
