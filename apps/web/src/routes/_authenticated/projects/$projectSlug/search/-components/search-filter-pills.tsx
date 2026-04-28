import type { FilterSet } from "@domain/shared"
import { TRACE_FILTER_FIELDS } from "@domain/shared"
import { Button, Icon } from "@repo/ui"
import { XIcon } from "lucide-react"
import { getActivePresetLabel } from "../../../../../../components/filters-builder/date-presets.ts"
import { getInValues, getRangeValues, getTextFilterValue } from "../../../../../../components/filters-builder/utils.ts"

interface SearchFilterPillsProps {
  readonly filters: FilterSet
  readonly onRemove: (field: string) => void
  readonly onPillClick?: () => void
  readonly onClearAll?: () => void
}

const FIELD_LABEL: Record<string, string> = Object.fromEntries(TRACE_FILTER_FIELDS.map((f) => [f.field, f.label]))

const FIELD_TYPE: Record<string, string> = Object.fromEntries(TRACE_FILTER_FIELDS.map((f) => [f.field, f.type]))

function summarizeRange(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`
  if (min !== undefined) return `≥${min}`
  if (max !== undefined) return `≤${max}`
  return ""
}

function summarizeFilter(filters: FilterSet, field: string): string {
  if (field === "startTime") {
    const conds = filters.startTime
    if (!conds) return ""
    const from = conds.find((c) => c.op === "gte")?.value
    const to = conds.find((c) => c.op === "lte")?.value
    const preset = getActivePresetLabel(from ? String(from) : undefined, to ? String(to) : undefined)
    if (preset) return preset
    if (from && to) return "Custom range"
    if (from) return `Since ${new Date(String(from)).toLocaleDateString()}`
    if (to) return `Until ${new Date(String(to)).toLocaleDateString()}`
    return ""
  }

  const type = FIELD_TYPE[field]
  if (type === "text") {
    const value = getTextFilterValue(filters, field)
    return value
  }
  if (type === "multiSelect") {
    const values = getInValues(filters, field)
    if (values.length === 0) return ""
    if (values.length === 1) return values[0] ?? ""
    return `${values.length} selected`
  }
  if (type === "numberRange") {
    const { min, max } = getRangeValues(filters, field)
    return summarizeRange(min, max)
  }
  return ""
}

interface PillEntry {
  readonly key: string
  readonly field: string
  readonly label: string
  readonly summary: string
}

function buildPillEntries(filters: FilterSet): PillEntry[] {
  const entries: PillEntry[] = []
  const seenMetadata = Object.keys(filters).some((k) => k.startsWith("metadata."))

  if (filters.startTime) {
    entries.push({
      key: "startTime",
      field: "startTime",
      label: "Time",
      summary: summarizeFilter(filters, "startTime"),
    })
  }

  for (const def of TRACE_FILTER_FIELDS) {
    if (def.field === "status") continue
    if (!filters[def.field]) continue
    entries.push({
      key: def.field,
      field: def.field,
      label: def.label,
      summary: summarizeFilter(filters, def.field),
    })
  }

  if (seenMetadata) {
    const count = Object.keys(filters).filter((k) => k.startsWith("metadata.")).length
    entries.push({
      key: "metadata",
      field: "metadata",
      label: "Metadata",
      summary: count > 1 ? `${count} keys` : "",
    })
  }

  for (const field of Object.keys(filters)) {
    if (field === "startTime") continue
    if (field === "status") continue
    if (field.startsWith("metadata.")) continue
    if (FIELD_LABEL[field]) continue
    entries.push({
      key: field,
      field,
      label: field,
      summary: "",
    })
  }

  return entries
}

export function SearchFilterPills({ filters, onRemove, onPillClick, onClearAll }: SearchFilterPillsProps) {
  const entries = buildPillEntries(filters)
  if (entries.length === 0) return null

  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      {entries.map((entry) => (
        <FilterPill
          key={entry.key}
          label={entry.label}
          summary={entry.summary}
          {...(onPillClick ? { onClick: onPillClick } : {})}
          onRemove={() => onRemove(entry.field)}
        />
      ))}
      {onClearAll ? (
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          Clear all
        </Button>
      ) : null}
    </div>
  )
}

function FilterPill({
  label,
  summary,
  onClick,
  onRemove,
}: {
  readonly label: string
  readonly summary: string
  readonly onClick?: () => void
  readonly onRemove: () => void
}) {
  return (
    <div className="inline-flex max-h-6 items-center rounded-md border border-muted-foreground/10 bg-muted text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => onClick?.()}
        className="flex h-full items-center gap-1 rounded-l-md py-0.5 pl-2 pr-1 hover:bg-muted/70"
      >
        <span className="whitespace-nowrap font-semibold">{label}</span>
        {summary ? <span className="whitespace-nowrap opacity-70">{summary}</span> : null}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="flex h-full items-center rounded-r-md py-0.5 pl-0.5 pr-1.5 opacity-70 hover:bg-muted/70 hover:opacity-100"
      >
        <Icon icon={XIcon} size="xs" />
      </button>
    </div>
  )
}
