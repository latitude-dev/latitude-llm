import { MAX_AGENT_GRAPH_DEPTH } from "../constants.ts"

const NS_PER_MS = 1_000_000

/**
 * Structural span shape the critical-path builder consumes. Deliberately loose, like
 * `AgentGraphSpanInput`, so both the domain `Span` and a compact source fact satisfy it.
 *
 * Interval algebra runs at millisecond resolution because that is what a `Date` boundary carries.
 * The per-span `duration_ns` column cannot be used instead: adding span durations is exactly the
 * double-count this reconstruction exists to prevent.
 */
export interface CriticalPathSpanInput {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string
  readonly operation: string
  readonly startTime: Date
  readonly endTime: Date
}

/**
 * How a trace's foreground envelope was identified.
 *
 * - `userInteraction` — a declared interaction root nothing outside the trace was waiting on.
 * - `nestedInteraction` — a declared interaction root whose parent lives outside the trace, so the
 *   interaction that awaited it already counts this time. Not applicable to Speed rather than
 *   incomplete.
 * - `unclassified` — the trace declares no interaction boundary.
 */
export const FOREGROUND_ROLES = ["userInteraction", "nestedInteraction", "unclassified"] as const
export type ForegroundRole = (typeof FOREGROUND_ROLES)[number]

/** `declared` — an interaction span said so. `structural` — one enclosing parentless span did. */
export const FOREGROUND_PROVENANCES = ["declared", "structural"] as const
export type ForegroundProvenance = (typeof FOREGROUND_PROVENANCES)[number]

export const CRITICAL_PATH_INCOMPLETE_REASONS = [
  "noForegroundRoot",
  "ambiguousForegroundRoot",
  "unfinishedSpan",
  "childOutsideParentEnvelope",
  "missingParent",
] as const
export type CriticalPathIncompleteReason = (typeof CRITICAL_PATH_INCOMPLETE_REASONS)[number]

export const CRITICAL_PATH_SEGMENT_KINDS = ["span", "concurrent", "gap"] as const
export type CriticalPathSegmentKind = (typeof CRITICAL_PATH_SEGMENT_KINDS)[number]

/**
 * One contiguous stretch of a foreground envelope, attributed to whatever explains it.
 *
 * `activeSpanIds` holds the deepest spans running across the whole stretch — an ancestor is dropped
 * in favour of the descendant that explains its time, so a nested generation owns its parent's
 * interval rather than sharing it. Two entries mean genuinely concurrent work, where removing
 * either one alone shortens nothing. An empty list is envelope time no span accounts for.
 */
export interface CriticalPathSegment {
  readonly startedAt: Date
  readonly endedAt: Date
  readonly durationNs: number
  readonly kind: CriticalPathSegmentKind
  readonly activeSpanIds: readonly string[]
  /** Set when exactly one span owns the stretch; removing it shortens the path by `durationNs`. */
  readonly spanId?: string
  readonly operation?: string
}

export interface ForegroundEnvelope {
  readonly rootSpanId: string
  readonly startedAt: Date
  readonly endedAt: Date
  readonly observedNs: number
}

export const TRACE_CRITICAL_PATH_COMPLETENESS = ["complete", "incomplete", "notApplicable"] as const
export type TraceCriticalPathCompleteness = (typeof TRACE_CRITICAL_PATH_COMPLETENESS)[number]

export interface TraceCriticalPath {
  readonly traceId: string
  readonly completeness: TraceCriticalPathCompleteness
  readonly role: ForegroundRole
  readonly provenance: ForegroundProvenance | null
  readonly envelopes: readonly ForegroundEnvelope[]
  readonly segments: readonly CriticalPathSegment[]
  readonly observedNs: number
  readonly reasons: readonly CriticalPathIncompleteReason[]
  /** Span id → its in-trace ancestors, so a subtree counterfactual can be resolved without the spans. */
  readonly ancestorIdsBySpanId: ReadonlyMap<string, ReadonlySet<string>>
  /** Spans outside every foreground envelope. Diagnostic; they did not delay the foreground result. */
  readonly excludedSpanIds: readonly string[]
}

export const SESSION_CRITICAL_PATH_COMPLETENESS = ["complete", "partial", "unavailable"] as const
export type SessionCriticalPathCompleteness = (typeof SESSION_CRITICAL_PATH_COMPLETENESS)[number]

export interface SessionCriticalPath {
  readonly traces: readonly TraceCriticalPath[]
  /** Σ of the complete traces' foreground envelopes. Traces run sequentially within a session. */
  readonly observedNs: number
  readonly completeness: SessionCriticalPathCompleteness
  readonly completeTraceCount: number
  readonly incompleteTraceCount: number
  readonly reasons: readonly CriticalPathIncompleteReason[]
}

const isInteraction = (span: CriticalPathSpanInput): boolean => span.operation === "invoke_agent"

const durationNsBetween = (fromMs: number, toMs: number): number => Math.max(0, toMs - fromMs) * NS_PER_MS

const buildAncestorSets = (
  spans: readonly CriticalPathSpanInput[],
  spanById: ReadonlyMap<string, CriticalPathSpanInput>,
): Map<string, Set<string>> => {
  const ancestors = new Map<string, Set<string>>()
  for (const span of spans) {
    const chain = new Set<string>()
    let current = spanById.get(span.parentSpanId)
    let depth = 0
    while (current && depth < MAX_AGENT_GRAPH_DEPTH && !chain.has(current.spanId) && current.spanId !== span.spanId) {
      chain.add(current.spanId)
      current = spanById.get(current.parentSpanId)
      depth += 1
    }
    ancestors.set(span.spanId, chain)
  }
  return ancestors
}

interface ForegroundResolution {
  readonly roots: readonly CriticalPathSpanInput[]
  readonly role: ForegroundRole
  readonly provenance: ForegroundProvenance | null
  readonly reasons: readonly CriticalPathIncompleteReason[]
}

const resolveForegroundRoots = (
  spans: readonly CriticalPathSpanInput[],
  spanById: ReadonlyMap<string, CriticalPathSpanInput>,
  ancestors: ReadonlyMap<string, ReadonlySet<string>>,
): ForegroundResolution => {
  const interactions = spans.filter(isInteraction)
  const declaredRoots = interactions.filter((span) => {
    const chain = ancestors.get(span.spanId)
    return !chain || ![...chain].some((id) => isInteraction(spanById.get(id) as CriticalPathSpanInput))
  })

  if (declaredRoots.length > 0) {
    const awaited = declaredRoots.filter((span) => span.parentSpanId !== "" && !spanById.has(span.parentSpanId))
    if (awaited.length === declaredRoots.length) {
      return { roots: declaredRoots, role: "nestedInteraction", provenance: "declared", reasons: [] }
    }
    const owned = declaredRoots.filter((span) => !awaited.includes(span))
    return { roots: owned, role: "userInteraction", provenance: "declared", reasons: [] }
  }

  const enclosing = spans.filter((span) => span.parentSpanId === "" || !spanById.has(span.parentSpanId))
  if (enclosing.length === 1) {
    return { roots: enclosing, role: "unclassified", provenance: "structural", reasons: [] }
  }
  return {
    roots: [],
    role: "unclassified",
    provenance: null,
    reasons: [enclosing.length === 0 ? "noForegroundRoot" : "ambiguousForegroundRoot"],
  }
}

interface ClippedSpan {
  readonly span: CriticalPathSpanInput
  readonly startMs: number
  readonly endMs: number
}

const leafMostActive = (
  active: readonly ClippedSpan[],
  ancestors: ReadonlyMap<string, ReadonlySet<string>>,
): ClippedSpan[] =>
  active.filter(
    (candidate) => !active.some((other) => ancestors.get(other.span.spanId)?.has(candidate.span.spanId) === true),
  )

const segmentFor = (
  startMs: number,
  endMs: number,
  leafMost: readonly ClippedSpan[],
  rootSpanId: string,
): CriticalPathSegment => {
  const shared = {
    startedAt: new Date(startMs),
    endedAt: new Date(endMs),
    durationNs: durationNsBetween(startMs, endMs),
  }
  const owner = leafMost.length === 1 ? leafMost[0] : undefined
  if (leafMost.length === 0) {
    return { ...shared, kind: "gap", activeSpanIds: [], spanId: rootSpanId }
  }
  if (owner) {
    return {
      ...shared,
      kind: "span",
      activeSpanIds: [owner.span.spanId],
      spanId: owner.span.spanId,
      operation: owner.span.operation,
    }
  }
  return {
    ...shared,
    kind: "concurrent",
    activeSpanIds: leafMost.map(({ span }) => span.spanId).sort(),
  }
}

const mergeAdjacent = (segments: readonly CriticalPathSegment[]): CriticalPathSegment[] => {
  const merged: CriticalPathSegment[] = []
  for (const segment of segments) {
    const previous = merged.at(-1)
    const continues =
      previous &&
      previous.kind === segment.kind &&
      previous.spanId === segment.spanId &&
      previous.endedAt.getTime() === segment.startedAt.getTime() &&
      previous.activeSpanIds.join(",") === segment.activeSpanIds.join(",")
    if (!continues || !previous) {
      merged.push(segment)
      continue
    }
    merged[merged.length - 1] = {
      ...previous,
      endedAt: segment.endedAt,
      durationNs: previous.durationNs + segment.durationNs,
    }
  }
  return merged
}

const decomposeEnvelope = ({
  root,
  descendants,
  ancestors,
}: {
  readonly root: CriticalPathSpanInput
  readonly descendants: readonly ClippedSpan[]
  readonly ancestors: ReadonlyMap<string, ReadonlySet<string>>
}): CriticalPathSegment[] => {
  const startMs = root.startTime.getTime()
  const endMs = root.endTime.getTime()
  const boundaries = new Set<number>([startMs, endMs])
  for (const clipped of descendants) {
    boundaries.add(clipped.startMs)
    boundaries.add(clipped.endMs)
  }
  const ordered = [...boundaries].filter((point) => point >= startMs && point <= endMs).sort((a, b) => a - b)

  const segments: CriticalPathSegment[] = []
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index] as number
    const to = ordered[index + 1] as number
    if (to <= from) continue
    const active = descendants.filter((clipped) => clipped.startMs <= from && clipped.endMs >= to)
    segments.push(segmentFor(from, to, leafMostActive(active, ancestors), root.spanId))
  }
  return mergeAdjacent(segments)
}

const clipToEnvelope = (
  span: CriticalPathSpanInput,
  root: CriticalPathSpanInput,
): { readonly clipped: ClippedSpan | null; readonly overflowed: boolean } => {
  const rootStart = root.startTime.getTime()
  const rootEnd = root.endTime.getTime()
  const spanStart = span.startTime.getTime()
  const spanEnd = span.endTime.getTime()
  if (spanEnd <= rootStart || spanStart >= rootEnd) return { clipped: null, overflowed: false }
  const startMs = Math.max(spanStart, rootStart)
  const endMs = Math.min(spanEnd, rootEnd)
  return {
    clipped: { span, startMs, endMs },
    overflowed: spanStart < rootStart || spanEnd > rootEnd,
  }
}

const isWithinSubtree = (
  span: CriticalPathSpanInput,
  rootSpanId: string,
  ancestors: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => span.spanId !== rootSpanId && ancestors.get(span.spanId)?.has(rootSpanId) === true

const orphanReasons = (
  spans: readonly CriticalPathSpanInput[],
  spanById: ReadonlyMap<string, CriticalPathSpanInput>,
  rootSpanIds: ReadonlySet<string>,
): CriticalPathIncompleteReason[] =>
  spans.some((span) => span.parentSpanId !== "" && !spanById.has(span.parentSpanId) && !rootSpanIds.has(span.spanId))
    ? ["missingParent"]
    : []

const unfinishedReasons = (spans: readonly CriticalPathSpanInput[]): CriticalPathIncompleteReason[] =>
  spans.some((span) => span.endTime.getTime() < span.startTime.getTime()) ? ["unfinishedSpan"] : []

interface EnvelopeBuild {
  readonly envelope: ForegroundEnvelope
  readonly segments: readonly CriticalPathSegment[]
  readonly explainedSpanIds: readonly string[]
  readonly overflowed: boolean
}

const buildEnvelope = ({
  root,
  spans,
  ancestors,
}: {
  readonly root: CriticalPathSpanInput
  readonly spans: readonly CriticalPathSpanInput[]
  readonly ancestors: ReadonlyMap<string, ReadonlySet<string>>
}): EnvelopeBuild => {
  const clippedDescendants = spans
    .filter((span) => isWithinSubtree(span, root.spanId, ancestors))
    .map((span) => clipToEnvelope(span, root))
  const descendants = clippedDescendants.flatMap(({ clipped }) => (clipped ? [clipped] : []))
  return {
    envelope: {
      rootSpanId: root.spanId,
      startedAt: root.startTime,
      endedAt: root.endTime,
      observedNs: durationNsBetween(root.startTime.getTime(), root.endTime.getTime()),
    },
    segments: decomposeEnvelope({ root, descendants, ancestors }),
    explainedSpanIds: [root.spanId, ...descendants.map(({ span }) => span.spanId)],
    overflowed: clippedDescendants.some(({ overflowed }) => overflowed),
  }
}

const resolveCompleteness = ({
  role,
  reasonCount,
  envelopeCount,
}: {
  readonly role: ForegroundRole
  readonly reasonCount: number
  readonly envelopeCount: number
}): TraceCriticalPathCompleteness => {
  if (role === "nestedInteraction") return "notApplicable"
  return reasonCount > 0 || envelopeCount === 0 ? "incomplete" : "complete"
}

/**
 * The user-visible critical path of one trace: the foreground envelopes, decomposed into the
 * segments that explain them.
 *
 * A complete foreground root supplies the observed interval; every descendant is clipped into that
 * envelope and explains part of it, so nothing is ever added on top of its parent. Work outside
 * every envelope is background and reported separately rather than counted.
 */
export const buildTraceCriticalPath = ({
  traceId,
  spans,
}: {
  readonly traceId: string
  readonly spans: readonly CriticalPathSpanInput[]
}): TraceCriticalPath => {
  const spanById = new Map(spans.map((span) => [span.spanId, span]))
  const ancestors = buildAncestorSets(spans, spanById)
  const foreground = resolveForegroundRoots(spans, spanById, ancestors)
  const rootSpanIds = new Set(foreground.roots.map((root) => root.spanId))
  const structuralReasons = [
    ...foreground.reasons,
    ...unfinishedReasons(spans),
    ...orphanReasons(spans, spanById, rootSpanIds),
  ]

  const builds = [...foreground.roots]
    .sort((left, right) => left.startTime.getTime() - right.startTime.getTime())
    .map((root) => buildEnvelope({ root, spans, ancestors }))

  const overflowed = builds.some((build) => build.overflowed)
  const reasons = [...new Set([...structuralReasons, ...(overflowed ? ["childOutsideParentEnvelope" as const] : [])])]
  const envelopes = builds.map((build) => build.envelope)
  const explained = new Set(builds.flatMap((build) => build.explainedSpanIds))

  return {
    traceId,
    completeness: resolveCompleteness({
      role: foreground.role,
      reasonCount: reasons.length,
      envelopeCount: envelopes.length,
    }),
    role: foreground.role,
    provenance: foreground.provenance,
    envelopes,
    segments: builds.flatMap((build) => build.segments),
    observedNs: envelopes.reduce((total, envelope) => total + envelope.observedNs, 0),
    reasons,
    ancestorIdsBySpanId: ancestors,
    excludedSpanIds: spans.filter((span) => !explained.has(span.spanId)).map((span) => span.spanId),
  }
}

/**
 * The session's observed critical path: the sum of its complete traces' foreground envelopes.
 *
 * Traces within a session run sequentially, so summing them is the whole aggregation — never the
 * session wall clock, never a sum of span durations, never a union across traces. Incomplete traces
 * keep their exact observed segments for the session view but contribute no observed time, so an
 * unreadable stretch is never treated as necessary.
 */
export const buildSessionCriticalPath = ({
  spans,
}: {
  readonly spans: readonly CriticalPathSpanInput[]
}): SessionCriticalPath => {
  const byTrace = new Map<string, CriticalPathSpanInput[]>()
  for (const span of spans) {
    const bucket = byTrace.get(span.traceId)
    if (bucket) bucket.push(span)
    else byTrace.set(span.traceId, [span])
  }

  const traces = [...byTrace.entries()]
    .map(([traceId, traceSpans]) => buildTraceCriticalPath({ traceId, spans: traceSpans }))
    .sort(
      (left, right) =>
        (left.envelopes[0]?.startedAt.getTime() ?? 0) - (right.envelopes[0]?.startedAt.getTime() ?? 0) ||
        left.traceId.localeCompare(right.traceId),
    )
  const scored = traces.filter((trace) => trace.completeness !== "notApplicable")
  const complete = scored.filter((trace) => trace.completeness === "complete")
  const incompleteTraceCount = scored.length - complete.length

  return {
    traces,
    observedNs: complete.reduce((total, trace) => total + trace.observedNs, 0),
    completeness: complete.length === 0 ? "unavailable" : incompleteTraceCount === 0 ? "complete" : "partial",
    completeTraceCount: complete.length,
    incompleteTraceCount,
    reasons: [...new Set(scored.flatMap((trace) => trace.reasons))],
  }
}

/**
 * How much of the trace's path disappears if `spanId` and everything under it never ran.
 *
 * This is the counterfactual rerun stated as arithmetic: a stretch is only lost when every span
 * still explaining it belongs to that subtree, so concurrent sibling work keeps its time and
 * removing one of two parallel calls saves nothing.
 */
export const marginalCriticalPathNs = ({
  path,
  spanId,
}: {
  readonly path: TraceCriticalPath
  readonly spanId: string
}): number => {
  const ownedBySubtree = (activeSpanId: string): boolean =>
    activeSpanId === spanId || path.ancestorIdsBySpanId.get(activeSpanId)?.has(spanId) === true
  return path.segments
    .filter((segment) => segment.activeSpanIds.length > 0 && segment.activeSpanIds.every(ownedBySubtree))
    .reduce((total, segment) => total + segment.durationNs, 0)
}

/**
 * The avoidable critical-path time of one observation, capped by what its subtree actually holds.
 *
 * `removedNs` is what the observation claims — a whole redundant call, or the excess over a frozen
 * cohort expectation. Time the span spent off the critical path cannot be saved by removing it.
 */
export const resolveMarginalAvoidableNs = ({
  path,
  spanId,
  removedNs,
}: {
  readonly path: TraceCriticalPath
  readonly spanId: string
  readonly removedNs: number
}): number => Math.max(0, Math.min(removedNs, marginalCriticalPathNs({ path, spanId })))
