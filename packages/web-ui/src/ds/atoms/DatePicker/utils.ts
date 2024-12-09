import { DateValue } from '@react-aria/datepicker'
import { parseDate } from '@internationalized/date'
import { format, parseISO, isDate } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

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
