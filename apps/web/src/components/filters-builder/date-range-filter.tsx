import type { FilterCondition, FilterSet } from "@domain/shared"
import { DateRangePicker } from "@repo/ui"
import {
  buildDateRangePresets,
  buildPickerRange,
  endOfLocalDay,
  getActivePresetId,
  startOfLocalDay,
} from "./date-presets.ts"

interface DateRangeFilterProps {
  readonly filters: FilterSet
  readonly onChange: (next: FilterSet) => void
}

function getTimeBound(filters: FilterSet, op: "gte" | "lte"): string | undefined {
  const conditions = filters.startTime
  if (!conditions) return undefined
  const match = conditions.find((c) => c.op === op)
  return match ? String(match.value) : undefined
}

function withStartTime(filters: FilterSet, from?: string, to?: string): FilterSet {
  const next = { ...filters }
  if (!from && !to) {
    delete next.startTime
    return next
  }
  const conditions: FilterCondition[] = []
  if (from) conditions.push({ op: "gte", value: from })
  if (to) conditions.push({ op: "lte", value: to })
  next.startTime = conditions
  return next
}

export function DateRangeFilter({ filters, onChange }: DateRangeFilterProps) {
  const startTimeFrom = getTimeBound(filters, "gte")
  const startTimeTo = getTimeBound(filters, "lte")
  const pickerRange = buildPickerRange(startTimeFrom, startTimeTo)
  const selectedPresetId = getActivePresetId(startTimeFrom, startTimeTo)
  const presets = buildDateRangePresets()

  return (
    <DateRangePicker
      value={pickerRange}
      presets={presets}
      selectedPresetId={selectedPresetId}
      placeholder="All time"
      onChange={({ range, source }) => {
        if (source === "clear" || !range) {
          onChange(withStartTime(filters))
          return
        }

        if (source === "preset") {
          onChange(withStartTime(filters, range.from?.toISOString(), range.to?.toISOString()))
          return
        }

        const normalizedFrom = range.from ? startOfLocalDay(range.from).toISOString() : undefined
        const rangeEnd = range.to ?? range.from
        const normalizedTo = rangeEnd ? endOfLocalDay(rangeEnd).toISOString() : undefined
        onChange(withStartTime(filters, normalizedFrom, normalizedTo))
      }}
    />
  )
}
