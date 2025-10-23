import { parseRelativeDate } from '../../lib/parseRelativeDate'

/**
 * Parses a date from various formats (Date object, ISO string, etc.)
 */
function parseDate(date: string) { }

export function parseAppearanceRangeFilter({
  from,
  to,
  relative,
}: {
  from?: Date | string
  to?: Date | string
  relative?: string
}) {
  // Handle relative date
  if (relative) {
    return parseRelativeDate(relative)
  }

  if (from && to) {
    const from = parseDate(from)
    const to = parseDate(to)

    if (!from || !to) return null
    return { from, to }
  }

  return null
}
