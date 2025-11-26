import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  formatISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import type { RelativeDate } from '@latitude-data/constants/relativeDates'
import { SelectOption } from '../../Select'
import { DateRange } from 'react-day-picker'
import { useMemo } from 'react'

export const RELATIVE_DATES_OPTIONS: SelectOption<RelativeDate>[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'current_week', label: 'Current week' },
  { value: 'current_month', label: 'Current month' },
  { value: 'current_year', label: 'Current year' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_days', label: 'Last 3 days' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_14_days', label: 'Last 14 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_60_days', label: 'Last 60 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'last_12_months', label: 'Last 12 months' },
]

function buildPreset(preset: RelativeDate) {
  switch (preset) {
    case 'today':
      return {
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      }
    case 'yesterday':
      return {
        from: startOfDay(subDays(new Date(), 1)),
        to: endOfDay(subDays(new Date(), 1)),
      }
    case 'current_week':
      return {
        from: startOfWeek(new Date(), { weekStartsOn: 1 }),
        to: endOfWeek(new Date(), { weekStartsOn: 1 }),
      }
    case 'current_month':
      return {
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
      }
    case 'current_year':
      return {
        from: startOfYear(new Date()),
        to: endOfDay(new Date()),
      }
    case 'last_week':
      return {
        from: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }),
        to: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }),
      }
    case 'last_month':
      return {
        from: startOfMonth(subMonths(new Date(), 1)),
        to: endOfMonth(subMonths(new Date(), 1)),
      }
    case 'last_3_days':
      return {
        from: startOfDay(subDays(new Date(), 3)),
        to: endOfDay(new Date()),
      }
    case 'last_7_days':
      return {
        from: startOfDay(subDays(new Date(), 7)),
        to: endOfDay(new Date()),
      }
    case 'last_14_days':
      return {
        from: startOfDay(subDays(new Date(), 14)),
        to: endOfDay(new Date()),
      }
    case 'last_30_days':
      return {
        from: startOfDay(subDays(new Date(), 30)),
        to: endOfDay(new Date()),
      }
    case 'last_60_days':
      return {
        from: startOfDay(subDays(new Date(), 60)),
        to: endOfDay(new Date()),
      }
    case 'last_90_days':
      return {
        from: startOfDay(subDays(new Date(), 90)),
        to: endOfDay(new Date()),
      }
    case 'last_12_months':
      return {
        from: startOfDay(subMonths(new Date(), 12)),
        to: endOfDay(new Date()),
      }
  }
}

function buildPresets() {
  return RELATIVE_DATES_OPTIONS.map((option) => {
    return {
      range: buildPreset(option.value),
      value: option.value,
      label: option.label,
    }
  })
}

export function usePresets({
  range,
  showPresets,
}: {
  range: DateRange | undefined
  showPresets?: boolean
}) {
  const selectedPreset = useMemo(() => {
    if (!showPresets) return undefined
    if (!range) return undefined

    const presets = buildPresets()
    const from = range?.from ? formatISO(range.from) : undefined
    const to = range?.to ? formatISO(range.to) : undefined
    const preset = presets.find(
      (preset) =>
        formatISO(preset.range.from) === from &&
        formatISO(preset.range.to) === to,
    )

    return preset
  }, [range, showPresets])

  return {
    options: RELATIVE_DATES_OPTIONS,
    buildPreset,
    selectedPreset,
  }
}
