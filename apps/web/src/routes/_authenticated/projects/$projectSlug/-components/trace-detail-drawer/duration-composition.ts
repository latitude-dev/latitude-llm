import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"

/**
 * Duration composition — how a trace's wall-clock time was spent.
 *
 * A trace is a tree of spans that overlap (a parent `invoke_agent`/`chain` span
 * contains its children) and can run in parallel (sibling tool calls). So we
 * cannot sum `duration` per operation — that double-counts. Instead we take the
 * **leaf** spans (the actual units of work) and **partition the wall-clock
 * timeline**: every instant is attributed to exactly one category, with any
 * instant where no leaf is running counted as **idle** (orchestration, network,
 * waiting). Overlapping categories are resolved by priority so the segments sum
 * exactly to the wall-clock duration.
 *
 * Times come from the spans' ISO `startTime`/`endTime`, so resolution is
 * milliseconds (the nanosecond precision from ClickHouse does not survive
 * serialization). That is plenty for trace-level durations.
 */

export type DurationCategory = "generation" | "tool" | "retrieval" | "other" | "idle"
type WorkCategory = Exclude<DurationCategory, "idle">

export interface DurationSegment {
  readonly category: DurationCategory
  readonly label: string
  readonly ms: number
  readonly color: string
  /** Idle is "no work happening" — rendered as an empty/hatched gap, not a solid fill. */
  readonly hollow?: boolean
}

// Green is "generation/output" (matches completion + output cost). The other
// work categories use warm tones (orange/amber) deliberately distinct from the
// blue/purple of the token & cost bars, so the two never get confused. Other is
// neutral slate; idle stays a hatched gray.
const DURATION_COLORS: Readonly<Record<DurationCategory, string>> = {
  generation: "#4ade80",
  tool: "#f97316",
  retrieval: "#f59e0b",
  other: "#94a3b8",
  idle: "#cbd5e1",
}

const CATEGORY_LABELS: Readonly<Record<DurationCategory, string>> = {
  generation: "Generation",
  tool: "Tools",
  retrieval: "Retrieval",
  other: "Other",
  idle: "Idle",
}

// Canonical render order (also the overlap-resolution priority for work categories).
const WORK_PRIORITY: readonly WorkCategory[] = ["generation", "tool", "retrieval", "other"]
const SEGMENT_ORDER: readonly DurationCategory[] = ["generation", "tool", "retrieval", "other", "idle"]

function categoryFor(operation: string): WorkCategory {
  switch (operation) {
    case "chat":
    case "text_completion":
      return "generation"
    case "execute_tool":
      return "tool"
    case "retrieval":
    case "reranker":
      return "retrieval"
    default:
      return "other"
  }
}

interface Interval {
  readonly startMs: number
  readonly endMs: number
  readonly category: WorkCategory
}

export function computeDurationBreakdown(spans: readonly SpanRecord[]): {
  segments: DurationSegment[]
  wallClockMs: number
} {
  // Spans with parseable, positive-length time ranges.
  const timed = spans
    .map((span) => ({ span, startMs: Date.parse(span.startTime), endMs: Date.parse(span.endTime) }))
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)

  if (timed.length === 0) return { segments: [], wallClockMs: 0 }

  // Wall clock spans the full trace, including container spans.
  const wallStart = Math.min(...timed.map((s) => s.startMs))
  const wallEnd = Math.max(...timed.map((s) => s.endMs))
  const wallClockMs = wallEnd - wallStart

  // Leaf = no other span declares it as parent. Container spans are excluded so
  // their children are not counted twice; the time a container holds beyond its
  // children naturally falls into idle.
  const parentIds = new Set(spans.map((s) => s.parentSpanId).filter((id) => id !== ""))
  const intervals: Interval[] = timed
    .filter(({ span }) => !parentIds.has(span.spanId))
    .map(({ span, startMs, endMs }) => ({ startMs, endMs, category: categoryFor(span.operation) }))

  const totals: Record<DurationCategory, number> = {
    generation: 0,
    tool: 0,
    retrieval: 0,
    other: 0,
    idle: 0,
  }

  // Sweep the timeline. Between consecutive event times the set of active
  // categories is constant; attribute that slice to the highest-priority active
  // category, or to idle when nothing is running.
  const events = intervals
    .flatMap((iv) => [
      { t: iv.startMs, category: iv.category, delta: 1 },
      { t: iv.endMs, category: iv.category, delta: -1 },
    ])
    .sort((a, b) => a.t - b.t)

  const active: Record<WorkCategory, number> = { generation: 0, tool: 0, retrieval: 0, other: 0 }
  const dominant = (): DurationCategory => WORK_PRIORITY.find((c) => active[c] > 0) ?? "idle"

  let cursor = wallStart
  let i = 0
  while (i < events.length) {
    const t = events[i].t
    if (t > cursor) {
      totals[dominant()] += t - cursor
      cursor = t
    }
    while (i < events.length && events[i].t === t) {
      active[events[i].category] += events[i].delta
      i++
    }
  }
  if (wallEnd > cursor) totals.idle += wallEnd - cursor

  return { segments: toSegments(totals), wallClockMs }
}

/**
 * Session-level composition: the breakdown is computed **per trace** and then
 * summed, so the gaps *between* traces (user think-time between turns) are never
 * counted as idle — only the idle *within* each trace is. The total then equals
 * the sum of per-trace wall clocks, matching how `session.durationNs` is derived
 * (sum of root-span durations).
 */
export function computeSessionDurationBreakdown(spans: readonly SpanRecord[]): {
  segments: DurationSegment[]
  wallClockMs: number
} {
  const byTrace = new Map<string, SpanRecord[]>()
  for (const span of spans) {
    const list = byTrace.get(span.traceId)
    if (list) list.push(span)
    else byTrace.set(span.traceId, [span])
  }

  const totals: Record<DurationCategory, number> = { generation: 0, tool: 0, retrieval: 0, other: 0, idle: 0 }
  let wallClockMs = 0
  for (const traceSpans of byTrace.values()) {
    const breakdown = computeDurationBreakdown(traceSpans)
    wallClockMs += breakdown.wallClockMs
    for (const segment of breakdown.segments) totals[segment.category] += segment.ms
  }

  return { segments: toSegments(totals), wallClockMs }
}

function toSegments(totals: Record<DurationCategory, number>): DurationSegment[] {
  return SEGMENT_ORDER.filter((category) => totals[category] > 0).map<DurationSegment>((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    ms: totals[category],
    color: DURATION_COLORS[category],
    ...(category === "idle" ? { hollow: true } : {}),
  }))
}
