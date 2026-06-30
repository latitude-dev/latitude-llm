import type { FilterCondition, FilterSet } from "@domain/shared"
import { Text } from "@repo/ui"
import { type RefObject, useMemo, useState } from "react"
import { MetadataFilter } from "../../../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import { MultiSelectFilter } from "../../../../../../../components/filters-builder/multi-select-filter.tsx"
import type { DistinctColumn } from "../../../../../../../components/filters-builder/types.ts"

// Dimensions surfaced to users for evaluation scoping. Numeric/percentile
// dimensions (cost, duration, etc.) are intentionally excluded — they describe
// trace shape, not which agent/feature a trace belongs to, which is what users
// are scoping by.
const EVAL_FILTER_DIMENSIONS: ReadonlyArray<{ readonly field: DistinctColumn; readonly label: string }> = [
  { field: "tags", label: "Tags" },
  { field: "serviceNames", label: "Services" },
  { field: "models", label: "Models" },
  { field: "providers", label: "Providers" },
]

export function getInValues(filter: FilterSet, field: string): readonly string[] {
  const cond = filter[field]?.find((c) => c.op === "in")
  return Array.isArray(cond?.value) ? cond.value.map(String) : []
}

export function setMultiSelect(filter: FilterSet, field: string, values: readonly string[]): FilterSet {
  if (values.length === 0) {
    const { [field]: _, ...rest } = filter
    return rest
  }
  return { ...filter, [field]: [{ op: "in", value: [...values] }] }
}

export function extractMetadataEntries(filter: FilterSet): { readonly key: string; readonly value: string }[] {
  const entries: { key: string; value: string }[] = []
  for (const [field, conditions] of Object.entries(filter)) {
    if (!field.startsWith("metadata.")) continue
    const key = field.slice("metadata.".length)
    for (const cond of conditions) {
      if (cond.op === "eq" && typeof cond.value === "string") {
        entries.push({ key, value: cond.value })
      }
    }
  }
  return entries
}

export function applyMetadataEntries(filter: FilterSet, entries: readonly { key: string; value: string }[]): FilterSet {
  const next: Record<string, readonly FilterCondition[]> = {}
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("metadata.")) next[key] = value
  }
  // `MetadataFilter` emits onChange on every keystroke, so partial rows with an
  // empty key/value reach us mid-typing. Persisting `metadata.` would be
  // rejected by `filterSetSchema` on save; drop incomplete rows instead.
  for (const entry of entries) {
    if (entry.key === "" || entry.value === "") continue
    next[`metadata.${entry.key}`] = [{ op: "eq", value: entry.value }]
  }
  return next
}

/**
 * Inline scope editor (tags/services/models/providers + metadata). The signal's
 * `filters` pre-gate is optional — an empty scope evaluates every matching trace.
 */
export function SignalScopeEditor({
  projectId,
  value,
  onChange,
}: {
  readonly projectId: string
  readonly value: FilterSet
  readonly onChange: (next: FilterSet) => void
}) {
  const [popoverContainerEl, setPopoverContainerEl] = useState<HTMLDivElement | null>(null)
  const popoverContainerRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({ current: popoverContainerEl }),
    [popoverContainerEl],
  )
  const metadataEntries = extractMetadataEntries(value)

  return (
    <div className="relative">
      <div ref={setPopoverContainerEl} aria-hidden className="absolute left-0 top-0" />
      <div className="flex flex-col gap-5 pb-4">
        <Text.H6 color="foregroundMuted">Applies to all traces — narrow with filters (optional)</Text.H6>
        {EVAL_FILTER_DIMENSIONS.map(({ field, label }) => {
          const selected = getInValues(value, field)
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <Text.H6 color="foregroundMuted">{label}</Text.H6>
              <MultiSelectFilter
                projectId={projectId}
                column={field}
                selected={selected}
                onChange={(values) => onChange(setMultiSelect(value, field, values))}
                portalContainer={popoverContainerRef}
              />
            </div>
          )
        })}
        <div className="flex flex-col gap-1.5">
          <Text.H6 color="foregroundMuted">Metadata</Text.H6>
          <MetadataFilter
            entries={metadataEntries}
            onChange={(entries) => onChange(applyMetadataEntries(value, entries))}
          />
        </div>
      </div>
    </div>
  )
}
