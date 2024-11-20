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

export function relativeTime(date: Date | null | undefined) {
  if (!date) return '-'
  // NOTE: This is a dummy defense to avoid crashing on the frontend
  if (!(date instanceof Date)) return '-'

  const now = new Date()

  if (differenceInHours(now, date) < 1) {
    return capitalize(formatDistanceToNow(date, { addSuffix: true }))
  }

  if (differenceInDays(now, date) < 6) {
    return capitalize(formatRelative(date, now))
  }

  return capitalize(format(date, 'PPpp'))
}
