import {
  differenceInDays,
  differenceInHours,
  format,
  formatDistanceToNow,
  formatRelative,
} from 'date-fns'

function capitalize(str: string) {
  return str.replace(/^\w/, (c) => c.toUpperCase())
}

export function relativeTimeForDate(date: Date) {
  const now = new Date()

  if (differenceInHours(now, date) < 1) {
    return capitalize(formatDistanceToNow(date, { addSuffix: true }))
  }

  if (differenceInDays(now, date) < 6) {
    return capitalize(formatRelative(date, now))
  }

  return capitalize(format(date, 'PPpp'))
}

export function relativeTime(date: Date | null | undefined) {
  if (!date) return '-'
  // NOTE: This is a dummy defense to avoid crashing on the frontend
  if (!(date instanceof Date)) return '-'

  return relativeTimeForDate(date)
}

/**
 * This use browser's Intl.RelativeTimeFormat to provide a "time ago" string
 * E.g., "5 minutes ago", "2 hours ago", "3 days ago", etc.
 * It takes into account timezones and localizes the output.
 */
export function timeAgo({
  input,
  locale = 'en',
}: {
  input: Date | string | null | undefined
  locale?: Intl.LocalesArgument
}) {
  if (!input) return '-'

  const date = input instanceof Date ? input : new Date(input)

  const now = new Date()

  const diffMs = now.getTime() - date.getTime()
  const diffSecs = diffMs / 1000
  const diffMins = diffSecs / 60
  const diffHours = diffMins / 60
  const diffDays = diffHours / 24
  const diffWeeks = diffDays / 7
  const diffMonths = diffDays / 30
  const diffYears = diffDays / 365

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (Math.abs(diffMins) < 1) return 'just now'
  if (Math.abs(diffMins) < 60) {
    return rtf.format(-Math.round(diffMins), 'minute')
  }
  if (Math.abs(diffHours) < 24) {
    return rtf.format(-Math.round(diffHours), 'hour')
  }
  if (Math.abs(diffDays) < 7) {
    return rtf.format(-Math.round(diffDays), 'day')
  }
  if (Math.abs(diffWeeks) < 5) {
    return rtf.format(-Math.round(diffWeeks), 'week')
  }
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(-Math.round(diffMonths), 'month')
  }
  return rtf.format(-Math.round(diffYears), 'year')
}
