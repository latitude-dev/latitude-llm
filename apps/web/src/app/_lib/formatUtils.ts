import { format, formatDistanceToNow, formatRelative } from 'date-fns'

const SECONDS = 1000 // ms
const MINUTES = 60 * SECONDS
const HOURS = MINUTES * 60
const DAYS = HOURS * 24
export function relativeTime(date: Date | null) {
  if (date == null) return 'never'
  if (!(date instanceof Date)) return '-' // NOTE: This is a dummy defense to avoid crashing on the frontend

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1 * HOURS) return formatDistanceToNow(date, { addSuffix: true })
  if (diff < 7 * DAYS) return formatRelative(date, new Date())
  return format(date, 'PPpp')
}

export function formatDuration(duration?: number | null) {
  if (!duration) return '-'
  if (duration < MINUTES) return `${(duration / SECONDS).toFixed(3)}s`

  const hours = Math.floor(duration / HOURS)
  const minutes = Math.floor((duration % HOURS) / MINUTES)
  const seconds = Math.floor((duration % MINUTES) / SECONDS)

  return `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`
}

export function formatCostInMillicents(cost_in_millicents: number) {
  return `$ ${cost_in_millicents / 100_000}`
}
