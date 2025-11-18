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

function formatTimeDistance(date: Date): string {
  const nowDate = new Date()
  const minutes = differenceInMinutes(nowDate, date)
  const hours = differenceInHours(nowDate, date)
  const days = differenceInDays(nowDate, date)
  const weeks = differenceInWeeks(nowDate, date)
  const months = differenceInMonths(nowDate, date)
  const years = differenceInYears(nowDate, date)

  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'}`
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  return `${years} year${years === 1 ? '' : 's'}`
}

export function LastSeenCell({ issue }: { issue: SerializedIssue }) {
  const text = useMemo(
    () => `${formatTimeDistance(issue.lastOccurredAt)} ago`,
    [issue.lastOccurredAt],
  )

  const tooltipContent = useMemo(() => {
    const firstSeenFormatted = format(issue.firstOccurredAt, 'PPpp')
    const lastSeenFormatted = issue.lastOccurredAt
      ? format(issue.lastOccurredAt, 'PPpp')
      : 'Never'
    return (
      <div className='text-sm'>
        <div>Last seen: {lastSeenFormatted}</div>
        <div>First seen: {firstSeenFormatted}</div>
      </div>
    )
  }, [issue.firstOccurredAt, issue.lastOccurredAt])

  return (
    <Tooltip
      asChild
      trigger={
        <Text.H5 align='right' color='foregroundMuted'>
          {text}
        </Text.H5>
      }
    >
      {tooltipContent}
    </Tooltip>
  )
}
