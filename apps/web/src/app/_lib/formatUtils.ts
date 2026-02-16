const SECONDS = 1000 // ms
const MINUTES = 60 * SECONDS
const HOURS = MINUTES * 60

export function formatDuration(
  duration?: number | null,
  milliseconds: boolean = true,
  decimals: number = 3,
) {
  if (duration === undefined || duration === null) {
    return '-'
  }

  if (duration < MINUTES && milliseconds) {
    return `${(duration / SECONDS).toFixed(decimals)}s`
  }

  const hours = Math.floor(duration / HOURS)
  const minutes = Math.floor((duration % HOURS) / MINUTES)
  const seconds = Math.floor((duration % MINUTES) / SECONDS)

  return `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`
}

export function formatCostInMillicents(cost_in_millicents: number) {
  return `$${(cost_in_millicents / 100_000).toFixed(6)}`
}
