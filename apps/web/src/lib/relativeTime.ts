import { format, formatDistanceToNow, formatRelative } from 'date-fns'

const HOURS = 1000 * 60 * 60
const DAYS = HOURS * 24

export function relativeTime(date?: Date | null) {
  if (date == null) return '-'

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const capitalize = (str: string) => str.replace(/^\w/, (c) => c.toUpperCase())

  if (diff < 1 * HOURS) {
    return capitalize(formatDistanceToNow(date, { addSuffix: true }))
  }
  if (diff < 7 * DAYS) return capitalize(formatRelative(date, new Date()))

  return capitalize(format(date, 'PPpp'))
}
