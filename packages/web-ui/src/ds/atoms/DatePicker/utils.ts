import { DateValue } from '@react-aria/datepicker'
import { parseDate } from '@internationalized/date'

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
