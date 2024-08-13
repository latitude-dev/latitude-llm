import { format, formatDistanceToNow, formatRelative } from 'date-fns'

const SECONDS = 1000 // ms
const MINUTES = 60 * SECONDS
const HOURS = MINUTES * 60
const DAYS = HOURS * 24
function relativeTime(date: Date | null) {
  if (date == null) return 'never'

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1 * HOURS) return formatDistanceToNow(date, { addSuffix: true })
  if (diff < 7 * DAYS) return formatRelative(date, new Date())
  return format(date, 'PPpp')
}

function formatDuration(duration: number) {
  if (duration < MINUTES) return `${(duration / SECONDS).toFixed(3)}s`

  const hours = Math.floor(duration / HOURS)
  const minutes = Math.floor((duration % HOURS) / MINUTES)
  const seconds = Math.floor((duration % MINUTES) / SECONDS)

  return `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`
}

function formatCost(cost: number) {
  return `$ ${(cost / 100).toFixed(2)}`
}

export { relativeTime, formatDuration, formatCost }
