import {
  SessionAnalysisRepository,
  type SessionMomentLabel,
  SessionMomentLabelRepository,
} from "@domain/conversation-intelligence"
import {
  createFakeSessionAnalysisRepository,
  createFakeSessionMomentLabelRepository,
} from "@domain/conversation-intelligence/testing"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { type CohortBaselineData, SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  assistant,
  assistantToolCall,
  makeHintContext,
  makeTrace,
  runGatherer,
  tool,
  user,
} from "../flagger-strategies/test-helpers.ts"
import {
  analyticalOutliersGatherer,
  momentLabelsGatherer,
  spanErrorsGatherer,
  toolErrorsGatherer,
  toolLoopGatherer,
} from "./gatherers.ts"
import type { SessionHintContext } from "./types.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const ANALYSIS_HASH = "d".repeat(64)

describe("spanErrorsGatherer", () => {
  it("emits span:error when the session has errored spans", async () => {
    const ctx = makeHintContext(makeTrace([user("hi")]), { errorCount: 3, spanCount: 10 })
    const hints = await runGatherer(spanErrorsGatherer, ctx)
    expect(hints).toEqual([{ kind: "span:error", evidence: "3 of 10 spans have error status" }])
  })

  it("emits nothing for a clean session", async () => {
    expect(await runGatherer(spanErrorsGatherer, makeHintContext(makeTrace([user("hi")])))).toEqual([])
  })
})

describe("toolErrorsGatherer", () => {
  it("emits one anchored tool:error hint per failing pair", async () => {
    const conversation = makeTrace([
      { role: "assistant", parts: [{ type: "tool_call", id: "call-1", name: "fetch", arguments: { url: "x" } }] },
      tool("call-1", { error: "boom" }),
    ])
    const hints = await runGatherer(toolErrorsGatherer, makeHintContext(conversation))

    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      kind: "tool:error",
      anchor: { messageIndex: 0, toolCallId: "call-1" },
    })
    expect(hints[0]?.evidence).toContain("boom")
  })

  it("emits a tool:error hint for a call outside the declared toolset", async () => {
    const conversation = { ...makeTrace([assistantToolCall("mystery", { q: 1 })]), definedTools: ["search"] }
    const hints = await runGatherer(toolErrorsGatherer, makeHintContext(makeTrace([])))
    expect(hints).toEqual([])

    const flagged = await runGatherer(toolErrorsGatherer, {
      ...makeHintContext(makeTrace([])),
      conversation,
    })
    expect(flagged).toHaveLength(1)
    expect(flagged[0]?.evidence).toContain("not in the declared toolset")
  })

  it("emits nothing for healthy tool traffic", async () => {
    const conversation = makeTrace([
      { role: "assistant", parts: [{ type: "tool_call", id: "call-1", name: "fetch", arguments: {} }] },
      tool("call-1", { ok: true, data: [] }),
    ])
    expect(await runGatherer(toolErrorsGatherer, makeHintContext(conversation))).toEqual([])
  })
})

describe("toolLoopGatherer", () => {
  it("emits tool:loop when one tool dominates ≥60% of ≥5 calls", async () => {
    const conversation = makeTrace([
      assistantToolCall("search", { q: "a" }),
      assistantToolCall("search", { q: "b" }),
      assistantToolCall("search", { q: "c" }),
      assistantToolCall("read", { p: "x" }),
      assistantToolCall("write", { p: "y" }),
    ])
    const hints = await runGatherer(toolLoopGatherer, makeHintContext(conversation))

    expect(hints).toHaveLength(1)
    expect(hints[0]?.kind).toBe("tool:loop")
    expect(hints[0]?.evidence).toContain('"search" is 3 of 5 calls')
  })

  it("emits nothing below the thresholds", async () => {
    const conversation = makeTrace([
      assistantToolCall("search", { q: "a" }),
      assistantToolCall("read", { p: "x" }),
      assistantToolCall("write", { p: "y" }),
      assistantToolCall("list", {}),
      assistantToolCall("delete", {}),
    ])
    expect(await runGatherer(toolLoopGatherer, makeHintContext(conversation))).toEqual([])
  })
})

const runMomentLabels = (
  ctx: SessionHintContext,
  labels: readonly SessionMomentLabel[],
  analysisStatus: "analyzed" | "skipped_too_short" = "analyzed",
) => {
  const { repository: analysisRepo } = createFakeSessionAnalysisRepository([
    {
      organizationId: OrganizationId(ORG_ID),
      projectId: ProjectId(PROJECT_ID),
      sessionId: SessionId("session-1"),
      startTime: new Date("2026-01-01T00:00:00.000Z"),
      endTime: new Date("2026-01-01T00:00:01.000Z"),
      traceIds: [],
      analysisHash: ANALYSIS_HASH,
      analysisStatus,
      statusReason: "",
      retentionDays: 90,
      indexedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ])
  const { repository: labelRepo } = createFakeSessionMomentLabelRepository(labels)

  return Effect.runPromise(
    momentLabelsGatherer
      .gather(ctx)
      .pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SessionAnalysisRepository, analysisRepo),
            Layer.succeed(SessionMomentLabelRepository, labelRepo),
          ),
        ),
      ) as Effect.Effect<readonly unknown[]>,
  )
}

const makeLabel = (kind: SessionMomentLabel["kind"], analysisHash = ANALYSIS_HASH): SessionMomentLabel => ({
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  sessionId: SessionId("session-1"),
  analysisHash,
  labelId: `label-${kind}-${analysisHash.slice(0, 4)}`,
  momentId: "moment-1",
  kind,
  actor: "user",
  firstMessageIndex: 2,
  lastMessageIndex: 4,
  summary: "User expresses frustration",
  evidence: "this is useless",
  confidence: 0.8,
  retentionDays: 90,
  indexedAt: new Date("2026-01-01T00:00:00.000Z"),
})

describe("momentLabelsGatherer", () => {
  const ctx = makeHintContext(makeTrace([user("hello"), assistant("hi")]))

  it("maps current-generation labels to moment:* hints with range anchors", async () => {
    const hints = await runMomentLabels(ctx, [makeLabel("user_frustration")])

    expect(hints).toEqual([
      {
        kind: "moment:user_frustration",
        anchor: { firstMessageIndex: 2, lastMessageIndex: 4 },
        evidence: "User expresses frustration — this is useless",
      },
    ])
  })

  it("filters labels from superseded generations", async () => {
    const hints = await runMomentLabels(ctx, [makeLabel("user_frustration", "f".repeat(64))])
    expect(hints).toEqual([])
  })

  it("emits nothing when the current analysis is not `analyzed`", async () => {
    const hints = await runMomentLabels(ctx, [makeLabel("user_frustration")], "skipped_too_short")
    expect(hints).toEqual([])
  })
})

const runOutliers = (ctx: SessionHintContext, baseline: CohortBaselineData) => {
  const { repository: sessionRepo } = createFakeSessionRepository({
    getCohortBaseline: () => Effect.succeed(baseline),
  })

  return Effect.runPromise(
    analyticalOutliersGatherer
      .gather(ctx)
      .pipe(Effect.provide(Layer.succeed(SessionRepository, sessionRepo))) as Effect.Effect<
      readonly { kind: string }[]
    >,
  )
}

const percentiles = (p90: number, sampleCount = 100) => ({ sampleCount, p50: p90 / 2, p90, p95: null, p99: null })

describe("analyticalOutliersGatherer", () => {
  it("emits outlier hints for metrics at or above the project p90", async () => {
    const ctx = makeHintContext(makeTrace([user("hi")]), {
      durationNs: 10_000,
      tokensTotal: 5_000,
      timeToFirstTokenNs: 10,
      costTotalMicrocents: 1,
    })
    const hints = await runOutliers(ctx, {
      count: 100,
      metrics: {
        durationNs: percentiles(9_000),
        tokensTotal: percentiles(6_000),
        timeToFirstTokenNs: percentiles(100),
        costTotalMicrocents: percentiles(100),
      },
    })

    expect(hints.map((hint) => hint.kind)).toEqual(["outlier:duration"])
  })

  it("emits nothing when the cohort is too small for a meaningful p90", async () => {
    const ctx = makeHintContext(makeTrace([user("hi")]), { durationNs: 10_000 })
    const hints = await runOutliers(ctx, {
      count: 5,
      metrics: {
        durationNs: percentiles(1, 5),
        tokensTotal: percentiles(1, 5),
        timeToFirstTokenNs: percentiles(1, 5),
        costTotalMicrocents: percentiles(1, 5),
      },
    })

    expect(hints).toEqual([])
  })
})
