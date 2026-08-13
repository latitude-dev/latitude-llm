import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { filterSpansWithAncestors, type SpanFilters } from "../trace-detail-drawer/tabs/spans-tab/span-filters.ts"

interface SessionSpanGroup {
  readonly traceId: string
  readonly trace: TraceRecord | undefined
  readonly startTime: string
  readonly endTime: string
  readonly spans: readonly SpanRecord[]
}

interface SpanSelection {
  readonly traceId: string
  readonly spanId: string
}

export function spanSelectionKey(selection: SpanSelection): string {
  return `${selection.traceId}:${selection.spanId}`
}

export function getLoadedSessionSpanTraceIds({
  loadedTraceIds,
  sessionTraceIds,
  selectedSpanTraceId,
}: {
  readonly loadedTraceIds: readonly string[]
  readonly sessionTraceIds: readonly string[]
  readonly selectedSpanTraceId: string
}): readonly string[] {
  const traceIds = new Set(loadedTraceIds)
  if (selectedSpanTraceId && sessionTraceIds.includes(selectedSpanTraceId)) traceIds.add(selectedSpanTraceId)
  return [...traceIds]
}

export function getSessionTraceNumberById(groups: readonly SessionSpanGroup[]): ReadonlyMap<string, number> {
  return new Map(groups.map((group, index) => [group.traceId, index + 1]))
}

export function groupSessionSpans(
  spans: readonly SpanRecord[],
  traces: readonly TraceRecord[],
): readonly SessionSpanGroup[] {
  const traceById = new Map(traces.map((trace) => [trace.traceId, trace]))
  const spansByTrace = new Map<string, SpanRecord[]>()

  for (const span of spans) {
    const traceSpans = spansByTrace.get(span.traceId)
    if (traceSpans) traceSpans.push(span)
    else spansByTrace.set(span.traceId, [span])
  }

  const groups: SessionSpanGroup[] = []
  for (const [traceId, traceSpans] of spansByTrace) {
    traceSpans.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.spanId.localeCompare(b.spanId))
    const trace = traceById.get(traceId)
    groups.push({
      traceId,
      trace,
      startTime: trace?.startTime ?? traceSpans[0]?.startTime ?? "",
      endTime:
        trace?.endTime ?? traceSpans.reduce((latest, span) => (span.endTime > latest ? span.endTime : latest), ""),
      spans: traceSpans,
    })
  }

  groups.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.traceId.localeCompare(b.traceId))
  return groups
}

export function filterSessionSpanGroups(
  groups: readonly SessionSpanGroup[],
  filters: SpanFilters,
): readonly SessionSpanGroup[] {
  return groups.flatMap((group) => {
    const spans = filterSpansWithAncestors(group.spans, filters)
    return spans.length > 0 ? [{ ...group, spans }] : []
  })
}

export function resolveSpanTraceId(
  groups: readonly SessionSpanGroup[],
  spanId: string,
): { readonly traceId: string | null; readonly ambiguous: boolean } {
  let traceId: string | null = null
  for (const group of groups) {
    if (!group.spans.some((span) => span.spanId === spanId)) continue
    if (traceId !== null) return { traceId: null, ambiguous: true }
    traceId = group.traceId
  }
  return { traceId, ambiguous: false }
}
