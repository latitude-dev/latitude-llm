import type { FilterSet } from "@domain/shared"
import { TRACE_FILTER_FIELDS } from "@domain/shared"
import { cn, Icon } from "@repo/ui"
import { CornerDownLeftIcon, XIcon } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { getActivePresetLabel } from "../../../../../../components/filters-builder/date-presets.ts"
import { getInValues, getRangeValues, getTextFilterValue } from "../../../../../../components/filters-builder/utils.ts"

interface SearchFilterPillsProps {
  readonly filters: FilterSet
  readonly interactive?: boolean
  readonly onRemove?: (field: string) => void
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
  if (type === "text") return getTextFilterValue(filters, field)
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

export function SearchFilterPills({ filters, interactive = false, onRemove }: SearchFilterPillsProps) {
  const entries = buildPillEntries(filters)
  if (entries.length === 0) return null

  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      {entries.map((entry) =>
        interactive && onRemove ? (
          <InteractivePill
            key={entry.key}
            label={entry.label}
            summary={entry.summary}
            onRemove={() => onRemove(entry.field)}
          />
        ) : (
          <StaticPill key={entry.key} label={entry.label} summary={entry.summary} />
        ),
      )}
    </div>
  )
}

function StaticPill({ label, summary }: { readonly label: string; readonly summary: string }) {
  return (
    <div className="inline-flex max-h-6 items-center gap-1 rounded-md border border-muted-foreground/10 bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap font-semibold">{label}</span>
      {summary ? <span className="whitespace-nowrap opacity-70">{summary}</span> : null}
    </div>
  )
}

function InteractivePill({
  label,
  summary,
  onRemove,
}: {
  readonly label: string
  readonly summary: string
  readonly onRemove: () => void
}) {
  const [focused, setFocused] = useState(false)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      onRemove()
      return
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const target = event.currentTarget
      const sibling =
        event.key === "ArrowLeft"
          ? (target.previousElementSibling as HTMLElement | null)
          : (target.nextElementSibling as HTMLElement | null)
      if (sibling && sibling.tagName === "BUTTON") {
        event.preventDefault()
        sibling.focus()
      }
    }
  }

  return (
    <button
      type="button"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={onRemove}
      onKeyDown={handleKeyDown}
      aria-label={`Remove ${label} filter`}
      className={cn(
        "inline-flex max-h-6 items-center gap-1 rounded-md border border-muted-foreground/10 bg-muted px-2 py-0.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "hover:bg-muted/70",
      )}
    >
      <span className="whitespace-nowrap font-semibold">{label}</span>
      {summary ? <span className="whitespace-nowrap opacity-70">{summary}</span> : null}
      <Icon icon={focused ? CornerDownLeftIcon : XIcon} size="xs" />
    </button>
  )
}
