import { type FilterCondition, type FilterSet, TRACE_FILTER_FIELDS } from "@domain/shared"

const FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  TRACE_FILTER_FIELDS.map((f) => [f.field, f.label]),
)

interface FilterSummaryEntry {
  /** Stable React key. */
  readonly key: string
  /** Field label, e.g. "User ID". */
  readonly label: string
  /** Inline value preview (no label), e.g. "usr-x, usr-y" or "≥ 5"; empty when there is no value worth showing. */
  readonly preview: string
}

const valueText = (value: FilterCondition["value"]): string => (Array.isArray(value) ? value.join(", ") : String(value))

/** One condition as `<operator> <value>` — membership/equality drop the operator so it reads as the bare value(s). */
const conditionText = (condition: FilterCondition): string => {
  const value = valueText(condition.value)
  switch (condition.op) {
    case "in":
    case "eq":
      return value
    case "notIn":
    case "neq":
      return `not ${value}`
    case "gt":
      return `> ${value}`
    case "gte":
      return `≥ ${value}`
    case "lt":
      return `< ${value}`
    case "lte":
      return `≤ ${value}`
    case "contains":
      return `contains ${value}`
    case "notContains":
      return `excludes ${value}`
    case "gtePercentile":
      return `≥ P${value}`
    default:
      return value
  }
}

const previewFor = (conditions: readonly FilterCondition[]): string =>
  conditions.map(conditionText).filter(Boolean).join(" · ")

/**
 * Structured "what does this filter on" summary: one entry per constrained
 * field, each with a label and an inline value preview. `metadata.*` keys
 * collapse to a single "Metadata" entry (previewing the sub-keys); the
 * `score.annotatorId` field (the "Scored by" picker plus the "Has scores"
 * toggle) collapses to one "Scores" entry.
 */
export function summarizeFilterSet(filters: FilterSet): readonly FilterSummaryEntry[] {
  const entries: FilterSummaryEntry[] = []
  const metadataKeys: string[] = []
  let scoresSeen = false
  for (const [key, conditions] of Object.entries(filters)) {
    if (!conditions || conditions.length === 0) continue
    if (key.startsWith("metadata.")) {
      metadataKeys.push(key.slice("metadata.".length))
      continue
    }
    if (key === "score.annotatorId") {
      scoresSeen = true
      continue
    }
    entries.push({ key, label: FIELD_LABELS[key] ?? key, preview: previewFor(conditions) })
  }
  if (metadataKeys.length > 0) entries.push({ key: "metadata", label: "Metadata", preview: metadataKeys.join(", ") })
  if (scoresSeen) entries.push({ key: "scores", label: "Scores", preview: "" })
  return entries
}
