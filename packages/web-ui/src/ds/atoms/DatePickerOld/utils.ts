import { DateValue } from '@react-aria/datepicker'
import { parseDate } from '@internationalized/date'
import { format, parseISO, isDate } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { SelectOption } from '../Select'
import { RelativeDate } from '@latitude-data/core/browser'

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

export function safeParseValue(
  value: string | undefined,
): DateValue | undefined {
  let safeValue: DateValue | undefined = undefined

  if (!value) return safeValue

  try {
    safeValue = parseDate(value)
  } catch {
    // Do nothing
  }
  return safeValue
}

export function safeParseDate(date: DateValue | undefined): string | undefined {
  let safeValue: string | undefined = undefined
  const dateString = date?.toString?.()

  if (!dateString) return safeValue

  try {
    return parseDate(dateString).toString()
  } catch {
    return undefined
  }
}

export function valueToDateInTimeZone(value: string, timeZone?: string) {
  try {
    const date = parseISO(value) // This is parsed into local time
    if (!timeZone) return date

    const zonedDate = toZonedTime(date, timeZone) // So we convert it to UTC...
    return isDate(zonedDate) ? zonedDate : undefined
  } catch {
    return undefined
  }
}

export const formatDate = (value: string) => {
  try {
    const zonedDate = valueToDateInTimeZone(value)!
    return format(zonedDate, 'yyyy-MM-dd')
  } catch {
    return value
  }
}
