import type { CastingContext } from 'csv-parse'
import { isValid, parse } from 'date-fns'

const DATE_ONLY_FORMATS = [
  'yyyy-MM-dd',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'MMMM d, yyyy',
  'yyyy/MM/dd',
]

const DATETIME_FORMATS = [
  "yyyy-MM-dd'T'HH:mm:ss.SSSX",
  "yyyy-MM-dd'T'HH:mm:ss",
  'yyyy-MM-dd HH:mm:ss',
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-dd HH:mm',
  'dd/MM/yyyy HH:mm',
  'MM/dd/yyyy HH:mm',
  'dd-MM-yyyy HH:mm',
  'yyyy/MM/dd HH:mm',
]

function tryParseDate({
  input,
  dateTimeFormats,
  dateFormats,
}: {
  input: string
  dateTimeFormats: string[]
  dateFormats: string[]
}): string | null {
  const trimmed = input.trim()

  // First try full datetime formats
  for (const format of dateTimeFormats) {
    const parsed = parse(trimmed, format, new Date())
    if (isValid(parsed)) return parsed.toISOString()
  }

  // Then try date-only formats (converted manually to UTC midnight)
  for (const format of dateFormats) {
    const parsed = parse(trimmed, format, new Date())
    if (isValid(parsed)) {
      return new Date(
        Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
      ).toISOString()
    }
  }

  return null
}

export function castCell(value: string, _context: CastingContext) {
  const trimmed = value.trim().toLowerCase()

  if (trimmed === '' || ['null', 'undefined', 'nil'].includes(trimmed)) return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  const num = Number(value)
  if (!Number.isNaN(num)) return num

  // JSON parse
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  ) {
    try {
      return JSON.parse(value)
    } catch {
      // Ignore error
    }
  }

  // Try parsing ISO string with date-fns
  const date = tryParseDate({
    input: value,
    dateTimeFormats: DATETIME_FORMATS,
    dateFormats: DATE_ONLY_FORMATS,
  })
  if (date) return date

  // We can't cast the cell, return the original value
  return value
}
