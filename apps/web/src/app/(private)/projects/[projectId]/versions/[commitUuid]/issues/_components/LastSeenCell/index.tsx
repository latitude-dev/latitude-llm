import { useMemo } from 'react'
import { SerializedIssue } from '$/stores/issues'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  format,
} from 'date-fns'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

function formatTimeDistance(date: Date, baseDate: Date = new Date()): string {
  const minutes = differenceInMinutes(baseDate, date)
  const hours = differenceInHours(baseDate, date)
  const days = differenceInDays(baseDate, date)
  const weeks = differenceInWeeks(baseDate, date)
  const months = differenceInMonths(baseDate, date)
  const years = differenceInYears(baseDate, date)

  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'}`
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  return `${years} year${years === 1 ? '' : 's'}`
}

function getRelativeTimeText(createdAt: Date, lastSeenDate: Date | null) {
  const dateToUse = lastSeenDate || createdAt
  const now = new Date()

  const ageText = formatTimeDistance(createdAt, now)
  const lastSeenText = formatTimeDistance(dateToUse, now)

  return `${lastSeenText} ago / ${ageText} old`
}

export function LastSeenCell({ issue }: { issue: SerializedIssue }) {
  const text = useMemo(
    () => getRelativeTimeText(issue.createdAt, issue.lastSeenDate),
    [issue.createdAt, issue.lastSeenDate],
  )

  const tooltipContent = useMemo(() => {
    const firstSeenFormatted = format(issue.createdAt, 'PPpp')
    const lastSeenFormatted = issue.lastSeenDate
      ? format(issue.lastSeenDate, 'PPpp')
      : 'Never'
    return (
      <div className='text-sm'>
        <div>Last seen: {lastSeenFormatted}</div>
        <div>First seen: {firstSeenFormatted}</div>
      </div>
    )
  }, [issue.createdAt, issue.lastSeenDate])

  return (
    <Tooltip trigger={<Text.H5 color='foregroundMuted'>{text}</Text.H5>}>
      {tooltipContent}
    </Tooltip>
  )
}
