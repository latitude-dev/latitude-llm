import { DateRangePicker } from "@repo/ui"
import {
  buildDateRangePresets,
  buildPickerRange,
  endOfLocalDay,
  getActivePresetId,
  startOfLocalDay,
} from "../../../../../components/filters-builder/date-presets.ts"

interface TimeFilterDropdownProps {
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
  readonly onChange: (from?: string, to?: string) => void
}

export function TimeFilterDropdown({ startTimeFrom, startTimeTo, onChange }: TimeFilterDropdownProps) {
  const presets = buildDateRangePresets()
  const pickerRange = buildPickerRange(startTimeFrom, startTimeTo)
  const selectedPresetId = getActivePresetId(startTimeFrom, startTimeTo)

  return (
    <DateRangePicker
      value={pickerRange}
      presets={presets}
      selectedPresetId={selectedPresetId}
      placeholder="All time"
      onChange={({ range, source }) => {
        if (source === "clear" || !range) {
          onChange(undefined, undefined)
          return
        }

        if (source === "preset") {
          onChange(range.from?.toISOString(), range.to?.toISOString())
          return
        }

        const normalizedFrom = range.from ? startOfLocalDay(range.from).toISOString() : undefined
        const rangeEnd = range.to ?? range.from
        const normalizedTo = rangeEnd ? endOfLocalDay(rangeEnd).toISOString() : undefined

        onChange(normalizedFrom, normalizedTo)
      }}
    />
  )
}
