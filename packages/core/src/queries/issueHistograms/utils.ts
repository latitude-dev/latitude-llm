import { MINI_HISTOGRAM_STATS_DAYS } from '@latitude-data/constants/issues'
import { format, subDays } from 'date-fns'

export function fillMissingDays({
  data,
  days = MINI_HISTOGRAM_STATS_DAYS,
}: {
  data: Array<{ date: string; count: number }>
  days?: number
}): { data: Array<{ date: string; count: number }>; totalCount: number } {
  const dateMap = new Map<string, number>()
  let totalCount = 0
  data.forEach((r) => {
    const count = Number(r.count)
    dateMap.set(r.date, count)
    totalCount += count
  })

  const filledResults: Array<{ date: string; count: number }> = []
  const today = new Date()
  for (let i = 0; i < days; i++) {
    const date = subDays(today, days - 1 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const count = dateMap.get(dateStr) ?? 0
    filledResults.push({
      date: dateStr,
      count,
    })
  }

  return { data: filledResults, totalCount }
}
