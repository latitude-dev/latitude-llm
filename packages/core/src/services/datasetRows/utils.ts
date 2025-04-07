import { format, isValid, parseISO } from 'date-fns'
import { type DatasetRowDataContent } from '../../schema'

function formatMaybeIsoDate(value: string): string | null {
  if (typeof value !== 'string') return null

  try {
    const date = parseISO(value)
    if (!isValid(date)) return null

    // If there's time info, include it
    if (value.includes('T') && !value.endsWith('T00:00:00.000Z')) {
      return format(date, 'dd MMM yyyy, HH:mm')
    }

    return format(date, 'dd MMM yyyy')
  } catch {
    return null
  }
}

export function parseRowCell({
  cell,
  parseDates,
}: {
  cell: DatasetRowDataContent
  parseDates: boolean
}) {
  if (cell === null || cell === undefined) {
    return ''
  }

  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    if (typeof cell === 'string' && parseDates) {
      const formattedDate = formatMaybeIsoDate(cell)
      if (formattedDate) return formattedDate
    }
    return String(cell)
  }

  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell, null, 2)
    } catch {
      return String(cell)
    }
  }

  return String(cell)
}
