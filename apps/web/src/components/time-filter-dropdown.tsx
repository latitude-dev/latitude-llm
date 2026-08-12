import { type DateRange, DateRangePicker, type DateRangePickerPreset } from "@repo/ui"

export const TIME_PRESETS = [
  { id: "last-30-seconds", label: "Last 30 seconds", seconds: 30 },
  { id: "last-15-minutes", label: "Last 15 minutes", seconds: 15 * 60 },
  { id: "last-30-minutes", label: "Last 30 minutes", seconds: 30 * 60 },
  { id: "last-hour", label: "Last hour", seconds: 60 * 60 },
  { id: "last-day", label: "Last day", seconds: 24 * 60 * 60 },
  { id: "last-week", label: "Last week", seconds: 7 * 24 * 60 * 60 },
  { id: "last-2-weeks", label: "Last 2 weeks", seconds: 14 * 24 * 60 * 60 },
  { id: "last-month", label: "Last month", seconds: 30 * 24 * 60 * 60 },
] as const

export interface TimeFilterPreset {
  readonly id: string
  readonly label: string
  readonly seconds: number
}

interface TimeFilterDropdownProps {
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
  readonly onChange: (from?: string, to?: string) => void
  /** Overrides the trace-filtering presets for surfaces with a coarser natural cadence. */
  readonly presets?: readonly TimeFilterPreset[]
  readonly placeholder?: string
  /**
   * Selectable bounds, for a surface whose data only covers part of the timeline.
   * Days outside are not offered, and a preset whose window misses the bounds
   * entirely is dropped — it would carry a label promising data it cannot answer.
   */
  readonly minTime?: string | undefined
  readonly maxTime?: string | undefined
}

function buildPresetRange(seconds: number): DateRange {
  return { from: new Date(Date.now() - seconds * 1000) }
}

function buildPickerRange(startTimeFrom?: string, startTimeTo?: string): DateRange | undefined {
  // Bounds come from the URL and may be unparseable (hand-crafted). Drop invalid dates so an
  // `Invalid Date` never reaches the picker, where `date-fns` `format()` would throw a RangeError.
  const from = startTimeFrom ? new Date(startTimeFrom) : undefined
  const to = startTimeTo ? new Date(startTimeTo) : undefined
  const validFrom = from && Number.isFinite(from.getTime()) ? from : undefined
  const validTo = to && Number.isFinite(to.getTime()) ? to : undefined
  if (!validFrom && !validTo) return undefined

  return {
    ...(validFrom ? { from: validFrom } : {}),
    ...(validTo ? { to: validTo } : {}),
  }
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function getActivePresetId(
  presets: readonly TimeFilterPreset[],
  startTimeFrom?: string,
  startTimeTo?: string,
): string | undefined {
  if (!startTimeFrom || startTimeTo) return undefined

  const diffSeconds = Math.round((Date.now() - new Date(startTimeFrom).getTime()) / 1000)

  for (const preset of presets) {
    const toleranceSeconds = Math.max(2, Math.round(preset.seconds * 0.1))
    if (Math.abs(diffSeconds - preset.seconds) <= toleranceSeconds) {
      return preset.id
    }
  }

  return undefined
}

function parseBound(iso?: string): Date | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  return Number.isFinite(date.getTime()) ? date : undefined
}

/**
 * Presets worth offering inside selectable bounds. A preset is open-ended — it runs
 * from its start to now — so it survives when its window overlaps the bounds at all:
 * a start before `minDate` reaches for data that is not there, and a start after
 * `maxDate` lands wholly past the data, which is the case that would otherwise offer
 * "Last day" on a surface whose data stopped a week ago and answer it with nothing.
 */
export function presetsWithinBounds(
  presets: readonly TimeFilterPreset[],
  bounds: { readonly minDate?: Date; readonly maxDate?: Date },
  nowMs: number,
): readonly TimeFilterPreset[] {
  const { minDate, maxDate } = bounds
  if (!minDate && !maxDate) return presets
  return presets.filter((preset) => {
    const startMs = nowMs - preset.seconds * 1000
    return (!minDate || startMs >= minDate.getTime()) && (!maxDate || startMs <= maxDate.getTime())
  })
}

export function TimeFilterDropdown({
  startTimeFrom,
  startTimeTo,
  onChange,
  presets = TIME_PRESETS,
  placeholder = "All time",
  minTime,
  maxTime,
}: TimeFilterDropdownProps) {
  const minDate = parseBound(minTime)
  const maxDate = parseBound(maxTime)
  const offeredPresets = presetsWithinBounds(
    presets,
    { ...(minDate ? { minDate } : {}), ...(maxDate ? { maxDate } : {}) },
    Date.now(),
  )
  const pickerPresets: readonly DateRangePickerPreset[] = offeredPresets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    range: buildPresetRange(preset.seconds),
  }))
  const pickerRange = buildPickerRange(startTimeFrom, startTimeTo)
  const selectedPresetId = getActivePresetId(offeredPresets, startTimeFrom, startTimeTo)

  return (
    <DateRangePicker
      value={pickerRange}
      {...(minDate ? { minDate } : {})}
      {...(maxDate ? { maxDate } : {})}
      presets={pickerPresets}
      selectedPresetId={selectedPresetId}
      placeholder={placeholder}
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
