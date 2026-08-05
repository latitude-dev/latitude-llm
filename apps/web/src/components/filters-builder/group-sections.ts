import { TRACE_FILTER_GROUPS, type TraceFilterGroupId } from "@domain/shared"

interface FilterSectionGroup<T> {
  readonly id: TraceFilterGroupId
  readonly label: string
  readonly sections: readonly T[]
}

/**
 * Splits filter sections into the functional groups of `TRACE_FILTER_GROUPS`, in that order,
 * dropping groups left with no section. `query` matches a section label or its group label, so
 * searching "performance" keeps the whole group and "cost" keeps just that section.
 */
export function groupFilterSections<T extends { readonly group: TraceFilterGroupId; readonly label: string }>(
  sections: readonly T[],
  query: string,
): readonly FilterSectionGroup<T>[] {
  const needle = query.trim().toLowerCase()
  return TRACE_FILTER_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    sections: sections.filter(
      (section) =>
        section.group === group.id &&
        (needle === "" || section.label.toLowerCase().includes(needle) || group.label.toLowerCase().includes(needle)),
    ),
  })).filter((group) => group.sections.length > 0)
}
