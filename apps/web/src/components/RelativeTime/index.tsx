import { format } from 'date-fns'
import { relativeTimeForDate } from '$/lib/relativeTime'

export function RelativeTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <time>-</time>
  if (!(date instanceof Date)) return <time>-</time>

  const text = relativeTimeForDate(date)
  const iso = date.toISOString()

  return (
    <time dateTime={iso} title={format(date, 'PPpp')}>
      {text}
    </time>
  )
}
