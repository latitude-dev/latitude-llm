import { IMPORT_PREVIEW_SAMPLE_ROWS, type NormalizedSpanPreview } from "@domain/imports"

/**
 * One sampled span per trace, up to the sample limit.
 *
 * Sources return spans, and a trace has several, so taking the first N rows shows N spans of
 * a single trace — which tells the user nothing about the breadth of what they are about to
 * import. Distinct traces answer the question they are actually asking. Falls back to filling
 * the remaining slots from the leftovers when the range holds fewer traces than the limit.
 */
export const sampleDistinctTraces = <TRow>(
  rows: readonly TRow[],
  toPreview: (row: TRow) => NormalizedSpanPreview,
): readonly NormalizedSpanPreview[] => {
  const previews = rows.map(toPreview)
  const seen = new Set<string>()
  const sample: NormalizedSpanPreview[] = []

  for (const preview of previews) {
    if (sample.length >= IMPORT_PREVIEW_SAMPLE_ROWS) break
    if (seen.has(preview.traceId)) continue
    seen.add(preview.traceId)
    sample.push(preview)
  }

  for (const preview of previews) {
    if (sample.length >= IMPORT_PREVIEW_SAMPLE_ROWS) break
    if (!sample.includes(preview)) sample.push(preview)
  }

  return sample
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
