import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { getTraceTimeRange } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import {
  filterSessionSpanGroups,
  getLoadedSessionSpanTraceIds,
  getSessionTraceNumberById,
  groupSessionSpans,
  resolveSpanTraceId,
  spanSelectionKey,
} from "./session-spans.ts"

function makeSpan(
  partial: Partial<SpanRecord> & Pick<SpanRecord, "traceId" | "spanId" | "startTime" | "endTime">,
): SpanRecord {
  return {
    organizationId: "org",
    projectId: "project",
    parentSpanId: "",
    simulationId: "",
    name: partial.spanId,
    serviceName: "",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    operation: "",
    provider: "",
    model: "",
    agentName: "",
    toolName: "",
    toolNames: [],
    toolCallId: "",
    tokensInput: 0,
    tokensOutput: 0,
    costTotalMicrocents: 0,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    ingestedAt: partial.endTime,
    ...partial,
  }
}

function makeTrace(
  partial: Partial<TraceRecord> & Pick<TraceRecord, "traceId" | "startTime" | "endTime">,
): TraceRecord {
  return {
    organizationId: "org",
    projectId: "project",
    spanCount: 1,
    errorCount: 0,
    durationNs: 0,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    cacheHitRate: null,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    unpricedSpanCount: 0,
    sessionId: "session",
    userId: "",
    simulationId: "",
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: "",
    rootSpanName: "",
    ...partial,
  }
}

describe("session span groups", () => {
  it("includes a selected session trace that has not reached the loaded page", () => {
    expect(
      getLoadedSessionSpanTraceIds({
        loadedTraceIds: ["trace-a", "trace-b"],
        sessionTraceIds: ["trace-a", "trace-b", "trace-c"],
        selectedSpanTraceId: "trace-c",
      }),
    ).toEqual(["trace-a", "trace-b", "trace-c"])
  })

  it("groups spans oldest-first and falls back to span timing when trace metadata is missing", () => {
    const spans = [
      makeSpan({
        traceId: "trace-a",
        spanId: "shared",
        startTime: "2026-01-01T00:01:00.000Z",
        endTime: "2026-01-01T00:01:01.000Z",
      }),
      makeSpan({
        traceId: "trace-b",
        spanId: "shared",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T00:00:01.000Z",
      }),
    ]
    const traceA = makeTrace({
      traceId: "trace-a",
      startTime: "2026-01-01T00:01:00.000Z",
      endTime: "2026-01-01T00:01:01.000Z",
      rootSpanName: "Known trace",
    })

    const groups = groupSessionSpans(spans, [traceA])

    expect(groups.map((group) => group.traceId)).toEqual(["trace-b", "trace-a"])
    expect([...getSessionTraceNumberById(groups)]).toEqual([
      ["trace-b", 1],
      ["trace-a", 2],
    ])
    expect(groups[0]?.trace).toBeUndefined()
    expect(groups[0]?.startTime).toBe("2026-01-01T00:00:00.000Z")
    expect(groups[1]?.trace?.rootSpanName).toBe("Known trace")
    expect(groups.map((group) => getTraceTimeRange(group.spans).totalDuration)).toEqual([1000, 1000])
  })

  it("filters each trace independently, preserves ancestors, and hides empty groups", () => {
    const groups = groupSessionSpans(
      [
        makeSpan({
          traceId: "trace-a",
          spanId: "root",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:02.000Z",
        }),
        makeSpan({
          traceId: "trace-a",
          spanId: "error-child",
          parentSpanId: "root",
          statusCode: "error",
          startTime: "2026-01-01T00:00:01.000Z",
          endTime: "2026-01-01T00:00:02.000Z",
        }),
        makeSpan({
          traceId: "trace-b",
          spanId: "root",
          startTime: "2026-01-01T00:01:00.000Z",
          endTime: "2026-01-01T00:01:01.000Z",
        }),
      ],
      [],
    )

    const filtered = filterSessionSpanGroups(groups, { errors: true, tools: false, memory: false, model: "" })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.traceId).toBe("trace-a")
    expect(filtered[0]?.spans.map((span) => span.spanId)).toEqual(["root", "error-child"])
  })

  it("keeps compound selections distinct and rejects ambiguous legacy span ids", () => {
    const groups = groupSessionSpans(
      [
        makeSpan({
          traceId: "trace-a",
          spanId: "shared",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:01.000Z",
        }),
        makeSpan({
          traceId: "trace-b",
          spanId: "shared",
          startTime: "2026-01-01T00:01:00.000Z",
          endTime: "2026-01-01T00:01:01.000Z",
        }),
      ],
      [],
    )

    expect(spanSelectionKey({ traceId: "trace-a", spanId: "shared" })).not.toBe(
      spanSelectionKey({ traceId: "trace-b", spanId: "shared" }),
    )
    expect(resolveSpanTraceId(groups, "shared")).toEqual({ traceId: null, ambiguous: true })
    expect(resolveSpanTraceId(groups, "missing")).toEqual({ traceId: null, ambiguous: false })
  })
})
