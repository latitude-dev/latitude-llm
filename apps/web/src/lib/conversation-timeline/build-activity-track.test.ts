import { describe, expect, it } from "vitest"
import { buildActivityTrack } from "./build-activity-track.ts"
import { buildConversationTimeline } from "./build-conversation-timeline.ts"
import { TIMELINE_FIXTURE as FIXTURE, FIXTURE_T0, fixtureSpan as span } from "./timeline-fixture.ts"
import { buildTimelineScale, GAP_TIMELINE_MS } from "./timeline-scale.ts"

const at = (ms: number) => FIXTURE_T0 + ms

describe("buildActivityTrack", () => {
  it("paints the fixture session as ordered activity phases in timeline coordinates", () => {
    const timeline = buildConversationTimeline(FIXTURE)
    expect(timeline.activity).toEqual([
      { category: "idle", timelineStartMs: 0, timelineEndMs: 500, durationMs: 500 },
      { category: "generation", timelineStartMs: 500, timelineEndMs: 10_000, durationMs: 9_500 },
      { category: "toolOk", timelineStartMs: 10_000, timelineEndMs: 14_000, durationMs: 4_000 },
      { category: "generation", timelineStartMs: 14_000, timelineEndMs: 20_000, durationMs: 6_000 },
      {
        category: "idle",
        timelineStartMs: 20_000 + GAP_TIMELINE_MS,
        timelineEndMs: 20_200 + GAP_TIMELINE_MS,
        durationMs: 200,
      },
      {
        category: "generation",
        timelineStartMs: 20_200 + GAP_TIMELINE_MS,
        timelineEndMs: 30_000 + GAP_TIMELINE_MS,
        durationMs: 9_800,
      },
    ])
  })

  it("resolves overlapping work by priority (generation wins over tool)", () => {
    const scale = buildTimelineScale([{ startMs: at(0), endMs: at(10_000) }])
    const segments = buildActivityTrack(
      [
        span({ spanId: "llm", traceId: "t1", startMs: at(0), endMs: at(10_000), operation: "chat" }),
        span({ spanId: "tool", traceId: "t1", startMs: at(2_000), endMs: at(4_000), operation: "execute_tool" }),
      ],
      scale,
    )
    expect(segments).toEqual([
      { category: "generation", timelineStartMs: 0, timelineEndMs: 10_000, durationMs: 10_000 },
    ])
  })

  it("excludes container spans so their children are not double-counted", () => {
    const scale = buildTimelineScale([{ startMs: at(0), endMs: at(10_000) }])
    const segments = buildActivityTrack(
      [
        span({ spanId: "agent", traceId: "t1", startMs: at(0), endMs: at(10_000), operation: "invoke_agent" }),
        span({
          spanId: "tool",
          parentSpanId: "agent",
          traceId: "t1",
          startMs: at(2_000),
          endMs: at(4_000),
          operation: "execute_tool",
        }),
      ],
      scale,
    )
    expect(segments).toEqual([
      { category: "idle", timelineStartMs: 0, timelineEndMs: 2_000, durationMs: 2_000 },
      { category: "toolOk", timelineStartMs: 2_000, timelineEndMs: 4_000, durationMs: 2_000 },
      { category: "idle", timelineStartMs: 4_000, timelineEndMs: 10_000, durationMs: 6_000 },
    ])
  })

  it("paints failed tool calls as their own category", () => {
    const scale = buildTimelineScale([{ startMs: at(0), endMs: at(10_000) }])
    const segments = buildActivityTrack(
      [
        span({
          spanId: "tool",
          traceId: "t1",
          startMs: at(2_000),
          endMs: at(4_000),
          operation: "execute_tool",
          isError: true,
        }),
      ],
      scale,
    )
    expect(segments).toEqual([
      { category: "idle", timelineStartMs: 0, timelineEndMs: 2_000, durationMs: 2_000 },
      { category: "toolError", timelineStartMs: 2_000, timelineEndMs: 4_000, durationMs: 2_000 },
      { category: "idle", timelineStartMs: 4_000, timelineEndMs: 10_000, durationMs: 6_000 },
    ])
  })

  it("returns no segments when there are no spans", () => {
    const scale = buildTimelineScale([{ startMs: at(0), endMs: at(10_000) }])
    expect(buildActivityTrack([], scale)).toEqual([
      { category: "idle", timelineStartMs: 0, timelineEndMs: 10_000, durationMs: 10_000 },
    ])
  })
})
