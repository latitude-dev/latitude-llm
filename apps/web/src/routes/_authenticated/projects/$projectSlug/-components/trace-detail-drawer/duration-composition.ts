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

export type DurationCategory = "generation" | "toolOk" | "toolError" | "retrieval" | "other" | "idle"
type WorkCategory = Exclude<DurationCategory, "idle">

export interface DurationSegment {
  readonly category: DurationCategory
  readonly label: string
  readonly ms: number
  readonly color: string
  /** Idle is "no work happening" — rendered as an empty/hatched gap, not a solid fill. */
  readonly hollow?: boolean
}

// Blue = the model's own work (generation), the one hue shared with
// completion/output in the token & cost bars. Tool time is split by outcome —
// green for succeeded calls, red for failed — so the status colors are accurate
// rather than decorative. Retrieval is violet; idle stays a hatched gray.
export const DURATION_COLORS: Readonly<Record<DurationCategory, string>> = {
  generation: "hsl(var(--viz-blue))",
  toolOk: "hsl(var(--viz-green))",
  toolError: "hsl(var(--viz-red))",
  retrieval: "hsl(var(--viz-violet))",
  other: "hsl(var(--viz-gray))",
  idle: "hsl(var(--viz-idle))",
}

const CATEGORY_LABELS: Readonly<Record<DurationCategory, string>> = {
  generation: "Generation",
  toolOk: "Tools",
  toolError: "Failed tools",
  retrieval: "Retrieval",
  other: "Other",
  idle: "Idle",
}

// Canonical render order (also the overlap-resolution priority for work
// categories). Failed tool time outranks succeeded so failures always surface.
const WORK_PRIORITY: readonly WorkCategory[] = ["generation", "toolError", "toolOk", "retrieval", "other"]
const SEGMENT_ORDER: readonly DurationCategory[] = ["generation", "toolOk", "toolError", "retrieval", "other", "idle"]

function categoryFor(operation: string, statusCode: string): WorkCategory {
  switch (operation) {
    case "chat":
    case "text_completion":
    case "generate_content":
      return "generation"
    case "execute_tool":
      return statusCode === "error" ? "toolError" : "toolOk"
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
    .map(({ span, startMs, endMs }) => ({ startMs, endMs, category: categoryFor(span.operation, span.statusCode) }))

  const totals: Record<DurationCategory, number> = {
    generation: 0,
    toolOk: 0,
    toolError: 0,
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

  const active: Record<WorkCategory, number> = { generation: 0, toolOk: 0, toolError: 0, retrieval: 0, other: 0 }
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
 * counted as idle — only the idle *within* each trace is. That total is the sum
 * of per-trace wall clocks; `session.durationNs` itself is session wall-clock
 * (last end − first start across all spans), which can be larger when traces
 * are spaced apart.
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

  const totals: Record<DurationCategory, number> = {
    generation: 0,
    toolOk: 0,
    toolError: 0,
    retrieval: 0,
    other: 0,
    idle: 0,
  }
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
