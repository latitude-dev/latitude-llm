import { IMPORT_PREVIEW_SAMPLE_ROWS, type ImportTracePreview, type NormalizedSpanPreview } from "@domain/imports"

const parseMs = (time: string): number | null => {
  if (time === "") return null
  const ms = Date.parse(time)
  return Number.isNaN(ms) ? null : ms
}

const aggregateTrace = (traceId: string, spans: readonly NormalizedSpanPreview[]): ImportTracePreview => {
  const startTimes = spans.map((span) => parseMs(span.startTime)).filter((ms): ms is number => ms !== null)
  const endTimes = spans.map((span) => parseMs(span.endTime)).filter((ms): ms is number => ms !== null)
  const startMs = startTimes.length > 0 ? Math.min(...startTimes) : null
  const endMs = endTimes.length > 0 ? Math.max(...endTimes) : null

  // The earliest span names the trace: roots start first, so this is the root whenever the
  // page caught it.
  const first = spans.reduce((earliest, span) => {
    const ms = parseMs(span.startTime)
    const earliestMs = parseMs(earliest.startTime)
    if (ms === null) return earliest
    if (earliestMs === null || ms < earliestMs) return span
    return earliest
  }, spans[0]!)

  return {
    traceId,
    name: first.name,
    models: [...new Set(spans.map((span) => span.model).filter((model) => model !== ""))],
    startTime: startMs !== null ? new Date(startMs).toISOString() : "",
    durationNs: startMs !== null && endMs !== null && endMs > startMs ? (endMs - startMs) * 1_000_000 : 0,
  }
}

/**
 * The sample folded into traces, which is what the preview table shows.
 *
 * Sources return spans, and a trace has several, so rows sharing a trace id collapse into one
 * entry: the earliest span names it, and its models and duration aggregate over the spans the
 * preview page happened to catch — a trace whose spans continue past the page reports what was
 * seen, not its true extent.
 */
export const sampleDistinctTraces = <TRow>(
  rows: readonly TRow[],
  toPreview: (row: TRow) => NormalizedSpanPreview,
): readonly ImportTracePreview[] => {
  const byTrace = new Map<string, NormalizedSpanPreview[]>()

  for (const preview of rows.map(toPreview)) {
    const spans = byTrace.get(preview.traceId)
    if (spans) {
      spans.push(preview)
    } else if (byTrace.size < IMPORT_PREVIEW_SAMPLE_ROWS) {
      byTrace.set(preview.traceId, [preview])
    }
  }

  return [...byTrace.entries()].map(([traceId, spans]) => aggregateTrace(traceId, spans))
}

/**
 * The only caveat worth showing once the trace count is known.
 *
 * Previously every adapter warned that its source "does not report a total row count", which
 * was untrue of all three. With a real count the useful statement is whether the ceiling will
 * bite, and the count itself is shown by the wizard rather than buried in a warning.
 */
export const cappedWarning = (estimatedTraces: number | null, maxTraces: number): readonly string[] => {
  if (estimatedTraces === null) {
    return ["Could not read how many traces this range holds, so the import may stop before the range is covered."]
  }
  if (estimatedTraces > maxTraces) {
    return [
      `This range holds ${estimatedTraces.toLocaleString()} traces and the import stops at ${maxTraces.toLocaleString()}, ` +
        "so the oldest traces in the range will not be imported. Narrow the range to choose which history you keep.",
    ]
  }
  return []
}
