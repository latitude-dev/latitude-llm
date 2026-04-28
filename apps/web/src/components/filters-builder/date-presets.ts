import type { DateRange, DateRangePickerPreset } from "@repo/ui"

const TIME_PRESETS = [
  { id: "last-30-seconds", label: "Last 30 seconds", seconds: 30 },
  { id: "last-15-minutes", label: "Last 15 minutes", seconds: 15 * 60 },
  { id: "last-30-minutes", label: "Last 30 minutes", seconds: 30 * 60 },
  { id: "last-hour", label: "Last hour", seconds: 60 * 60 },
  { id: "last-day", label: "Last day", seconds: 24 * 60 * 60 },
  { id: "last-week", label: "Last week", seconds: 7 * 24 * 60 * 60 },
  { id: "last-2-weeks", label: "Last 2 weeks", seconds: 14 * 24 * 60 * 60 },
  { id: "last-month", label: "Last month", seconds: 30 * 24 * 60 * 60 },
] as const

function buildPresetRange(seconds: number): DateRange {
  return { from: new Date(Date.now() - seconds * 1000) }
}

export function buildPickerRange(startTimeFrom?: string, startTimeTo?: string): DateRange | undefined {
  if (!startTimeFrom && !startTimeTo) return undefined

  return {
    ...(startTimeFrom ? { from: new Date(startTimeFrom) } : {}),
    ...(startTimeTo ? { to: new Date(startTimeTo) } : {}),
  }
}

export function startOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function getActivePresetId(startTimeFrom?: string, startTimeTo?: string): string | undefined {
  if (!startTimeFrom || startTimeTo) return undefined

  const diffSeconds = Math.round((Date.now() - new Date(startTimeFrom).getTime()) / 1000)

  for (const preset of TIME_PRESETS) {
    const toleranceSeconds = Math.max(2, Math.round(preset.seconds * 0.1))
    if (Math.abs(diffSeconds - preset.seconds) <= toleranceSeconds) {
      return preset.id
    }
  }

  return undefined
}

export function buildDateRangePresets(): readonly DateRangePickerPreset[] {
  return TIME_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    range: buildPresetRange(preset.seconds),
  }))
}
