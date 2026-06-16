import { describe, expect, it } from "vitest"
import { buildConversationTimeline } from "./build-conversation-timeline.ts"
import {
  TIMELINE_FIXTURE as FIXTURE,
  FIXTURE_T0,
  fixtureMessage as message,
  fixtureSpan as span,
  fixtureText as text,
  fixtureToolCall as toolCall,
  fixtureToolResponse as toolResponse,
} from "./timeline-fixture.ts"

const at = (ms: number) => FIXTURE_T0 + ms

describe("buildConversationTimeline", () => {
  const timeline = buildConversationTimeline(FIXTURE)

  it("schedules system and first user message at session start", () => {
    expect(timeline.schedules[0]).toEqual({ kind: "instant", atMs: at(0) })
    expect(timeline.schedules[1]).toEqual({ kind: "instant", atMs: at(0) })
  })

  it("streams mapped assistant messages from start+ttft to span end", () => {
    expect(timeline.schedules[2]).toEqual({
      kind: "streamed",
      revealStartMs: at(1_500),
      revealEndMs: at(10_000),
      textChars: "Let me check.".length,
    })
    expect(timeline.schedules[4]).toEqual({
      kind: "streamed",
      revealStartMs: at(14_500),
      revealEndMs: at(20_000),
      textChars: "Result is 42.".length,
    })
  })

  it("schedules tool results at the execute_tool span end", () => {
    expect(timeline.schedules[3]).toEqual({
      kind: "toolResult",
      parts: [{ partIndex: 0, toolCallId: "call_1", atMs: at(14_000) }],
    })
  })

  it("schedules a new-turn user message at its trace start", () => {
    expect(timeline.schedules[5]).toEqual({ kind: "instant", atMs: at(140_000) })
  })

  it("collapses non-streaming spans to instant at span end", () => {
    expect(timeline.schedules[6]).toEqual({ kind: "instant", atMs: at(150_000) })
  })

  it("places annotation markers at anchored message completion, not createdAt", () => {
    const annotations = timeline.markers.filter((m) => m.kind === "annotation")
    expect(annotations).toEqual([
      {
        kind: "annotation",
        atMs: at(20_000),
        annotationId: "ann1",
        messageIndex: 4,
        passed: false,
        feedback: "wrong",
        flaggerSlug: null,
        annotatorName: "Carlos",
      },
      {
        kind: "annotation",
        atMs: at(150_000),
        annotationId: "ann2",
        messageIndex: null,
        passed: true,
        feedback: "overall fine",
        flaggerSlug: null,
        annotatorName: null,
      },
    ])
  })

  it("attaches the turn-starting user message excerpt to trace markers", () => {
    const traceMarkers = timeline.markers.filter((m) => m.kind === "trace")
    expect(traceMarkers.map((m) => m.userExcerpt)).toEqual(["question one", "question two"])
  })

  it("attaches the turn-starting user message index to trace markers", () => {
    const traceMarkers = timeline.markers.filter((m) => m.kind === "trace")
    expect(traceMarkers.map((m) => m.firstMessageIndex)).toEqual([1, 5])
  })

  it("emits markers sorted by time, skipping successful tools and non-tool errors", () => {
    expect(timeline.markers.map((m) => m.kind)).toEqual(["trace", "annotation", "trace", "annotation", "moment"])
  })

  it("places moment markers at the anchored message completion", () => {
    const moment = timeline.markers.find((m) => m.kind === "moment")
    expect(moment).toEqual({
      kind: "moment",
      atMs: at(150_000),
      momentId: "label1",
      messageIndex: 6,
      label: "frustration",
      summary: "User repeated the request",
      confidence: 0.87,
    })
  })

  it("compresses the inter-trace gap in the scale", () => {
    expect(timeline.scale.segments.map((s) => s.kind)).toEqual(["active", "gap", "active"])
    expect(timeline.wallStartMs).toBe(at(0))
    expect(timeline.wallEndMs).toBe(at(150_000))
  })
})

describe("buildConversationTimeline edge cases", () => {
  it("falls back to monotonic instants for unmapped assistant messages", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [
        message("user", text("hi")),
        message("assistant", text("mapped")),
        message("assistant", text("unmapped")),
      ],
      messageSpanMap: { 1: "s1" },
      annotations: [],
    })
    expect(timeline.schedules[2]).toEqual({ kind: "instant", atMs: at(10_001) })
  })

  it("degrades to an evenly spaced slideshow when nothing is mapped", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [message("system", text("s")), message("user", text("u")), message("assistant", text("a"))],
      messageSpanMap: {},
      toolCallSpanMap: {},
      annotations: [],
    })
    expect(timeline.schedules[0]).toEqual({ kind: "instant", atMs: at(0) })
    const atMsOf = (i: number) => {
      const schedule = timeline.schedules[i]
      return schedule?.kind === "instant" ? schedule.atMs : Number.NaN
    }
    expect(atMsOf(1)).toBeGreaterThan(at(0))
    expect(atMsOf(2)).toBeGreaterThan(atMsOf(1))
    expect(atMsOf(2)).toBeLessThan(at(150_000))
  })

  it("uses the first user message for trace markers when span mapping is unavailable", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [message("system", text("s")), message("user", text("u")), message("assistant", text("a"))],
      spans: [],
      messageSpanMap: {},
      toolCallSpanMap: {},
      traces: [{ traceId: "t1", startMs: at(0), endMs: at(100_000), label: "Trace 1" }],
      annotations: [],
      moments: [],
    })
    const marker = timeline.markers.find((m) => m.kind === "trace")
    expect(marker).toMatchObject({ firstMessageIndex: 1, userExcerpt: "u" })
  })

  it("collapses streaming spans with ttft past span end to instant at span end", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [message("assistant", text("late"))],
      spans: [
        span({ spanId: "s1", traceId: "t1", startMs: at(0), endMs: at(1_000), ttftMs: 5_000, isStreaming: true }),
      ],
      messageSpanMap: { 0: "s1" },
      annotations: [],
    })
    expect(timeline.schedules[0]).toEqual({ kind: "instant", atMs: at(1_000) })
  })

  it("splits one span's reveal window across consecutive assistant messages by char share", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [message("assistant", text("aaaaaa")), message("assistant", text("bb"))],
      spans: [span({ spanId: "s1", traceId: "t1", startMs: at(0), endMs: at(8_000), ttftMs: 0, isStreaming: true })],
      messageSpanMap: { 0: "s1", 1: "s1" },
      annotations: [],
    })
    expect(timeline.schedules[0]).toEqual({
      kind: "streamed",
      revealStartMs: at(0),
      revealEndMs: at(6_000),
      textChars: 6,
    })
    expect(timeline.schedules[1]).toEqual({
      kind: "streamed",
      revealStartMs: at(6_000),
      revealEndMs: at(8_000),
      textChars: 2,
    })
  })

  it("falls back tool results to the next mapped span start when no execute_tool span exists", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [
        message("assistant", text("calling"), toolCall("call_x")),
        message("tool", toolResponse("call_x")),
        message("assistant", text("done")),
      ],
      messageSpanMap: { 0: "s1", 2: "s3" },
      toolCallSpanMap: {},
      annotations: [],
    })
    expect(timeline.schedules[1]).toEqual({
      kind: "toolResult",
      parts: [{ partIndex: 0, toolCallId: "call_x", atMs: at(14_000) }],
    })
  })

  it("marks only failing tool calls — successful tools and errored non-tool spans get no marker", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      spans: [
        span({ spanId: "fast", traceId: "t1", startMs: at(0), endMs: at(500), operation: "execute_tool" }),
        span({
          spanId: "failed",
          traceId: "t1",
          startMs: at(1_000),
          endMs: at(1_200),
          operation: "execute_tool",
          isError: true,
          name: "lookup",
        }),
        span({
          spanId: "llm",
          traceId: "t1",
          startMs: at(2_000),
          endMs: at(3_000),
          operation: "chat",
          isError: true,
        }),
      ],
      annotations: [],
      moments: [],
    })
    const eventMarkers = timeline.markers.filter((m) => m.kind !== "trace")
    expect(eventMarkers).toEqual([
      {
        kind: "toolCall",
        atMs: at(1_200),
        spanId: "failed",
        toolCallId: null,
        label: "lookup",
        durationMs: 200,
        errorExcerpt: null,
      },
    ])
  })

  it("excerpts the mapped tool's returned output on failed-tool markers", () => {
    const longError = `Error: The number of items\nto be exchanged should match. ${"details ".repeat(40)}`
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [
        message("assistant", text("calling"), toolCall("call_1")),
        message("tool", { type: "tool_call_response", id: "call_1", response: longError }),
      ],
      spans: [
        span({ spanId: "s1", traceId: "t1", startMs: at(0), endMs: at(1_000), operation: "chat" }),
        span({
          spanId: "s2",
          traceId: "t1",
          startMs: at(1_000),
          endMs: at(2_000),
          operation: "execute_tool",
          isError: true,
        }),
      ],
      messageSpanMap: { 0: "s1" },
      toolCallSpanMap: { call_1: "s2" },
      annotations: [],
      moments: [],
    })
    const marker = timeline.markers.find((m) => m.kind === "toolCall")
    expect(marker?.errorExcerpt).toMatch(/^Error: The number of items to be exchanged should match\./)
    expect(marker?.errorExcerpt?.endsWith("…")).toBe(true)
    expect(marker?.errorExcerpt?.length).toBeLessThanOrEqual(181)
    expect(timeline.failedToolCallIds).toEqual(new Set(["call_1"]))
  })

  it("leaves failedToolCallIds empty when no mapped tool errored", () => {
    expect(buildConversationTimeline(FIXTURE).failedToolCallIds.size).toBe(0)
  })

  it("stringifies object tool outputs in the excerpt", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      messages: [
        message("assistant", text("calling"), toolCall("call_1")),
        message("tool", { type: "tool_call_response", id: "call_1", response: { error: "mismatch", code: 42 } }),
      ],
      spans: [
        span({
          spanId: "s2",
          traceId: "t1",
          startMs: at(1_000),
          endMs: at(2_000),
          operation: "execute_tool",
          isError: true,
        }),
      ],
      messageSpanMap: {},
      toolCallSpanMap: { call_1: "s2" },
      annotations: [],
      moments: [],
    })
    const marker = timeline.markers.find((m) => m.kind === "toolCall")
    expect(marker?.errorExcerpt).toBe('{"error":"mismatch","code":42}')
  })

  it("falls back to the span status message when the failed tool is unmapped", () => {
    const timeline = buildConversationTimeline({
      ...FIXTURE,
      spans: [
        span({
          spanId: "s2",
          traceId: "t1",
          startMs: at(1_000),
          endMs: at(2_000),
          operation: "execute_tool",
          isError: true,
          statusMessage: "tool runner crashed",
        }),
      ],
      toolCallSpanMap: {},
      annotations: [],
      moments: [],
    })
    const marker = timeline.markers.find((m) => m.kind === "toolCall")
    expect(marker?.errorExcerpt).toBe("tool runner crashed")
  })

  it("handles empty conversations", () => {
    const timeline = buildConversationTimeline({ ...FIXTURE, messages: [], annotations: [], moments: [] })
    expect(timeline.schedules).toEqual([])
    expect(timeline.scale.totalTimelineMs).toBeGreaterThan(0)
  })
})
