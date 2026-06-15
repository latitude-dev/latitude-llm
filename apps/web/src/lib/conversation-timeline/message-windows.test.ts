import { describe, expect, it } from "vitest"
import { buildConversationTimeline } from "./build-conversation-timeline.ts"
import { messageIndexAtTime, visibleRangeToBand } from "./message-windows.ts"
import { TIMELINE_FIXTURE as FIXTURE, FIXTURE_T0 } from "./timeline-fixture.ts"
import { timelineToPct, wallToTimeline } from "./timeline-scale.ts"

const at = (ms: number) => FIXTURE_T0 + ms

// Fixture geometry: trace 1 active [0s,20s], gap compressed to 1.5s, trace 2
// active [140s,150s] → total timeline 31.5s.
const timeline = buildConversationTimeline(FIXTURE)
const pctAtWall = (wallMs: number) => timelineToPct(timeline.scale, wallToTimeline(timeline.scale, wallMs))

describe("messageIndexAtTime", () => {
  it("resolves a position inside a streamed window to that message", () => {
    expect(messageIndexAtTime(timeline, 5_000)).toBe(2)
  })

  it("resolves a position between messages to the last started one", () => {
    expect(messageIndexAtTime(timeline, 12_000)).toBe(2)
  })

  it("resolves a position inside a compressed gap to the next trace's first message", () => {
    expect(messageIndexAtTime(timeline, 20_500)).toBe(5)
  })

  it("clamps positions before the start and past the end", () => {
    expect(messageIndexAtTime(timeline, -100)).toBe(1)
    expect(messageIndexAtTime(timeline, timeline.scale.totalTimelineMs + 100)).toBe(6)
  })

  it("returns null for empty conversations", () => {
    expect(messageIndexAtTime({ ...timeline, schedules: [] }, 1_000)).toBeNull()
  })
})

describe("visibleRangeToBand", () => {
  it("maps a message range to its time band in track percent", () => {
    expect(visibleRangeToBand(timeline, 2, 4)).toEqual({
      startPct: pctAtWall(at(1_500)),
      endPct: pctAtWall(at(20_000)),
    })
  })

  it("covers the whole track for the full message range", () => {
    expect(visibleRangeToBand(timeline, 0, 6)).toEqual({ startPct: 0, endPct: 100 })
  })

  it("clamps an inverted range to a zero-width band", () => {
    const band = visibleRangeToBand(timeline, 6, 2)
    expect(band).not.toBeNull()
    expect(band?.startPct).toBe(band?.endPct)
  })

  it("returns null for out-of-range indices or an empty scale", () => {
    expect(visibleRangeToBand(timeline, 0, 99)).toBeNull()
    expect(visibleRangeToBand(buildConversationTimeline({ ...FIXTURE, traces: [] }), 0, 1)).toBeNull()
  })
})
