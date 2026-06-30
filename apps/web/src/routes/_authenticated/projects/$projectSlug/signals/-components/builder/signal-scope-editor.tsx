import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, DropdownMenu, Icon, Text } from "@repo/ui"
import { PlusIcon, XIcon } from "lucide-react"
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
const METADATA_FIELD = "metadata"

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
 * Inline scope editor. The signal's `filters` pre-gate is optional — an empty scope
 * evaluates every trace. Filter dimensions stay hidden behind "Add filter" and are
 * revealed progressively, so the default (all traces) reads as one clear line rather
 * than a wall of empty pickers.
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
  // Dimensions revealed this session but not yet given a value; a dimension with a
  // value is always shown (e.g. when editing an existing signal's scope).
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())

  const dimensionShown = (field: DistinctColumn) => getInValues(value, field).length > 0 || revealed.has(field)
  const metadataShown = metadataEntries.length > 0 || revealed.has(METADATA_FIELD)
  const hasActiveFilters =
    EVAL_FILTER_DIMENSIONS.some((d) => getInValues(value, d.field).length > 0) || metadataEntries.length > 0

  const reveal = (field: string) => setRevealed((prev) => new Set(prev).add(field))
  const hideDimension = (field: DistinctColumn) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.delete(field)
      return next
    })
    onChange(setMultiSelect(value, field, []))
  }
  const hideMetadata = () => {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.delete(METADATA_FIELD)
      return next
    })
    onChange(applyMetadataEntries(value, []))
  }

  const addableOptions = [
    ...EVAL_FILTER_DIMENSIONS.filter((d) => !dimensionShown(d.field)).map((d) => ({
      label: d.label,
      onClick: () => reveal(d.field),
    })),
    ...(metadataShown ? [] : [{ label: "Metadata", onClick: () => reveal(METADATA_FIELD) }]),
  ]

  return (
    <div className="relative">
      <div ref={setPopoverContainerEl} aria-hidden className="absolute left-0 top-0" />
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <Text.H5>
            {hasActiveFilters
              ? "This signal evaluates traces matching the filters below."
              : "This signal evaluates every trace in your project."}
          </Text.H5>
          <Text.H6 color="foregroundMuted">
            Add a filter to limit the detector to a subset — for example, only the `checkout` service.
          </Text.H6>
        </div>

        {EVAL_FILTER_DIMENSIONS.filter((d) => dimensionShown(d.field)).map(({ field, label }) => (
          <div key={field} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Text.H6 color="foregroundMuted">{label}</Text.H6>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => hideDimension(field)}
                aria-label={`Remove ${label} filter`}
              >
                <Icon icon={XIcon} size="sm" />
              </Button>
            </div>
            <MultiSelectFilter
              projectId={projectId}
              column={field}
              selected={getInValues(value, field)}
              onChange={(values) => onChange(setMultiSelect(value, field, values))}
              portalContainer={popoverContainerRef}
            />
          </div>
        ))}

        {metadataShown ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Text.H6 color="foregroundMuted">Metadata</Text.H6>
              <Button variant="ghost" size="icon" onClick={hideMetadata} aria-label="Remove metadata filter">
                <Icon icon={XIcon} size="sm" />
              </Button>
            </div>
            <MetadataFilter
              entries={metadataEntries}
              onChange={(entries) => onChange(applyMetadataEntries(value, entries))}
            />
          </div>
        ) : null}

        {addableOptions.length > 0 ? (
          <div>
            <DropdownMenu
              trigger={() => (
                <Button variant="outline" size="sm">
                  <Icon icon={PlusIcon} size="sm" />
                  Add filter
                </Button>
              )}
              options={addableOptions}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
