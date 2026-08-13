import { TRACE_FILTER_GROUPS, type TraceFilterGroupId } from "@domain/shared"

interface FilterSectionGroup<T> {
  readonly id: TraceFilterGroupId
  readonly label: string
  readonly sections: readonly (T & { readonly hidden: boolean })[]
  readonly hidden: boolean
}

/**
 * Splits filter sections into the functional groups of `TRACE_FILTER_GROUPS`, in that order,
 * dropping groups left with no section. `query` matches a section label or its group label, so
 * searching "performance" keeps the whole group and "cost" keeps just that section.
 *
 * Search misses are marked `hidden` rather than dropped: the caller keeps them mounted so a
 * half-typed value in a debounced control isn't discarded when the query stops matching it.
 * Groups a mode never offers at all carry no section and are dropped outright.
 */
export function groupFilterSections<T extends { readonly group: TraceFilterGroupId; readonly label: string }>(
  sections: readonly T[],
  query: string,
): readonly FilterSectionGroup<T>[] {
  const needle = query.trim().toLowerCase()
  return TRACE_FILTER_GROUPS.map((group) => {
    const groupMatches = needle === "" || group.label.toLowerCase().includes(needle)
    const groupSections = sections
      .filter((section) => section.group === group.id)
      .map((section) => ({ ...section, hidden: !groupMatches && !section.label.toLowerCase().includes(needle) }))
    return {
      id: group.id,
      label: group.label,
      sections: groupSections,
      hidden: groupSections.every((section) => section.hidden),
    }
  }).filter((group) => group.sections.length > 0)
}
