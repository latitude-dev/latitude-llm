import type { SpanRecord } from "../../../../../../../../domains/spans/spans.functions.ts"

export type SpanFilters = {
  readonly errors: boolean
  readonly tools: boolean
  readonly subagents: boolean
  readonly model: string
}

export const EMPTY_SPAN_FILTERS: SpanFilters = {
  errors: false,
  tools: false,
  subagents: false,
  model: "",
}

export function hasActiveSpanFilters(filters: SpanFilters): boolean {
  return filters.errors || filters.tools || filters.subagents || filters.model.length > 0
}

function spanMatchesFilters(span: SpanRecord, filters: SpanFilters): boolean {
  if (filters.errors && span.statusCode !== "error") return false
  if (filters.tools && span.operation !== "execute_tool") return false
  if (filters.subagents && !span.isSubagent) return false
  if (filters.model.length > 0 && span.model !== filters.model) return false
  return true
}

/** Keeps matching spans plus ancestor chain so the tree stays navigable. */
export function filterSpansWithAncestors(spans: readonly SpanRecord[], filters: SpanFilters): readonly SpanRecord[] {
  if (!hasActiveSpanFilters(filters)) return spans

  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const visibleIds = new Set<string>()

  for (const span of spans) {
    if (!spanMatchesFilters(span, filters)) continue

    let current: SpanRecord | undefined = span
    const visited = new Set<string>()
    while (current && !visited.has(current.spanId)) {
      visited.add(current.spanId)
      visibleIds.add(current.spanId)
      const parentId = current.parentSpanId
      if (!parentId || parentId === current.spanId) break
      current = byId.get(parentId)
    }
  }

  return spans.filter((span) => visibleIds.has(span.spanId))
}

export function collectSpanModels(spans: readonly SpanRecord[]): string[] {
  const models = new Set<string>()
  for (const span of spans) {
    if (span.model.trim().length > 0) models.add(span.model)
  }
  return [...models].sort((a, b) => a.localeCompare(b))
}

export function countMatchingSpans(spans: readonly SpanRecord[], filters: SpanFilters): number {
  if (!hasActiveSpanFilters(filters)) return spans.length
  return spans.filter((span) => spanMatchesFilters(span, filters)).length
}
