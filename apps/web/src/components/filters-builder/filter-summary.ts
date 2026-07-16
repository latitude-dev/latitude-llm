import { type FilterSet, TRACE_FILTER_FIELDS } from "@domain/shared"

const FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  TRACE_FILTER_FIELDS.map((f) => [f.field, f.label]),
)

/**
 * Human-readable labels for the fields a FilterSet actually constrains, for a
 * compact "what does this filter on" summary. `score.annotatorId` carries both
 * the "Scored by" people picker and the "Has scores" toggle, so it collapses to
 * one "Scores" label; `metadata.*` keys collapse to a single "Metadata".
 */
export function summarizeFilterSet(filters: FilterSet): readonly string[] {
  const labels: string[] = []
  let metadataSeen = false
  let scoresSeen = false
  for (const [key, conditions] of Object.entries(filters)) {
    if (!conditions || conditions.length === 0) continue
    if (key.startsWith("metadata.")) {
      if (!metadataSeen) labels.push("Metadata")
      metadataSeen = true
      continue
    }
    if (key === "score.annotatorId") {
      if (!scoresSeen) labels.push("Scores")
      scoresSeen = true
      continue
    }
    labels.push(FIELD_LABELS[key] ?? key)
  }
  return labels
}
