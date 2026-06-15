import type { TimelineScale } from "./timeline-scale.ts"
import { wallToTimeline } from "./timeline-scale.ts"

/**
 * Same categories and overlap-resolution priority as the trace duration bar
 * (duration-composition.ts), but producing time-ordered segments instead of
 * per-category totals, so the scrubber can paint what the agent was doing at
 * each moment.
 */
export type ActivityCategory = "generation" | "toolOk" | "toolError" | "retrieval" | "other" | "idle"
type WorkCategory = Exclude<ActivityCategory, "idle">

export interface ActivitySegment {
  readonly category: ActivityCategory
  readonly timelineStartMs: number
  readonly timelineEndMs: number
  readonly durationMs: number
}

interface ActivitySpanInput {
  readonly spanId: string
  readonly parentSpanId: string
  readonly startMs: number
  readonly endMs: number
  readonly operation: string
  readonly isError: boolean
}

const WORK_PRIORITY: readonly WorkCategory[] = ["generation", "toolError", "toolOk", "retrieval", "other"]

function categoryFor(operation: string, isError: boolean): WorkCategory {
  switch (operation) {
    case "chat":
    case "text_completion":
      return "generation"
    case "execute_tool":
      return isError ? "toolError" : "toolOk"
    case "retrieval":
    case "reranker":
      return "retrieval"
    default:
      return "other"
  }
}

interface WallSlice {
  readonly startMs: number
  readonly endMs: number
  readonly category: ActivityCategory
}

/** Partition wall-clock time into category slices via a sweep over leaf spans. */
function sweepWallSlices(spans: readonly ActivitySpanInput[]): WallSlice[] {
  const parentIds = new Set(spans.map((s) => s.parentSpanId).filter((id) => id !== ""))
  const leaves = spans.filter((s) => !parentIds.has(s.spanId) && s.endMs > s.startMs)

  const events = leaves
    .flatMap((s) => {
      const category = categoryFor(s.operation, s.isError)
      return [
        { t: s.startMs, category, delta: 1 },
        { t: s.endMs, category, delta: -1 },
      ]
    })
    .sort((a, b) => a.t - b.t)

  const active: Record<WorkCategory, number> = { generation: 0, toolOk: 0, toolError: 0, retrieval: 0, other: 0 }
  const dominant = (): ActivityCategory => WORK_PRIORITY.find((c) => active[c] > 0) ?? "idle"

  const slices: WallSlice[] = []
  let cursor = Number.NEGATIVE_INFINITY
  let i = 0
  while (i < events.length) {
    const event = events[i]
    if (!event) break
    const t = event.t
    if (Number.isFinite(cursor) && t > cursor) {
      slices.push({ startMs: cursor, endMs: t, category: dominant() })
    }
    cursor = Math.max(cursor, t)
    while (i < events.length && events[i]?.t === t) {
      const e = events[i]
      if (e) active[e.category] += e.delta
      i++
    }
  }
  return slices
}

/**
 * Activity segments covering the scale's active windows, in timeline
 * coordinates. Moments inside a trace with no running leaf span are `idle`;
 * the compressed between-trace gaps are not included (the scrubber renders
 * those from the scale itself).
 */
export function buildActivityTrack(
  spans: readonly ActivitySpanInput[],
  scale: TimelineScale,
): readonly ActivitySegment[] {
  const slices = sweepWallSlices(spans)
  const segments: ActivitySegment[] = []

  for (const window of scale.segments) {
    if (window.kind !== "active") continue

    let cursor = window.wallStartMs
    const emit = (startMs: number, endMs: number, category: ActivityCategory) => {
      if (endMs <= startMs) return
      const timelineStartMs = wallToTimeline(scale, startMs)
      const timelineEndMs = wallToTimeline(scale, endMs)
      const last = segments[segments.length - 1]
      if (last && last.category === category && last.timelineEndMs === timelineStartMs) {
        segments[segments.length - 1] = {
          category,
          timelineStartMs: last.timelineStartMs,
          timelineEndMs,
          durationMs: last.durationMs + (endMs - startMs),
        }
        return
      }
      segments.push({ category, timelineStartMs, timelineEndMs, durationMs: endMs - startMs })
    }

    for (const slice of slices) {
      const startMs = Math.max(slice.startMs, window.wallStartMs)
      const endMs = Math.min(slice.endMs, window.wallEndMs)
      if (endMs <= startMs) continue
      if (startMs > cursor) emit(cursor, startMs, "idle")
      emit(startMs, endMs, slice.category)
      cursor = Math.max(cursor, endMs)
    }
    if (cursor < window.wallEndMs) emit(cursor, window.wallEndMs, "idle")
  }

  return segments
}
