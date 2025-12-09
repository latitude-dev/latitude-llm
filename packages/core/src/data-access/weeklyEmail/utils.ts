import { DateRange, SureDateRange } from '../../constants'

function getLastWeeklyDateRange(): SureDateRange {
  const now = new Date()
  const lastWeekEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  )
  const lastWeekStart = new Date(
    lastWeekEnd.getFullYear(),
    lastWeekEnd.getMonth(),
    lastWeekEnd.getDate() - 7,
  )
  return { from: lastWeekStart, to: lastWeekEnd }
}

export function getDateRangeOrLastWeekRange(range?: DateRange) {
  const { from, to } = getLastWeeklyDateRange()

  return range ? { from: range.from ?? from, to: range.to ?? to } : { from, to }
}
