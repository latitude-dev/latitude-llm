import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { RelativeDate } from '@latitude-data/core/browser'
import { SelectOption } from '../../Select'

export const RELATIVE_DATES_OPTIONS: SelectOption<RelativeDate>[] = [
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
        from: subDays(new Date(), 3),
        to: new Date(),
      }
    case 'last_7_days':
      return {
        from: subDays(new Date(), 7),
        to: new Date(),
      }
    case 'last_14_days':
      return {
        from: subDays(new Date(), 14),
        to: new Date(),
      }
    case 'last_30_days':
      return {
        from: subDays(new Date(), 30),
        to: new Date(),
      }
    case 'last_60_days':
      return {
        from: subDays(new Date(), 60),
        to: new Date(),
      }
    case 'last_90_days':
      return {
        from: subDays(new Date(), 90),
        to: new Date(),
      }
    case 'last_12_months':
      return {
        from: subMonths(new Date(), 12),
        to: new Date(),
      }
  }
}

export function usePresets() {
  return {
    options: RELATIVE_DATES_OPTIONS,
    buildPreset,
  }
}
