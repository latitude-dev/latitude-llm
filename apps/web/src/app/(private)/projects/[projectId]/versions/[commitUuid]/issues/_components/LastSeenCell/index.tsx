import { useMemo } from 'react'
import { SerializedIssue } from '$/stores/issues'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { format } from 'date-fns'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { timeAgo } from '$/lib/relativeTime'

export function LastSeenCell({ issue }: { issue: SerializedIssue }) {
  const text = useMemo(
    () => timeAgo({ input: issue.lastOccurredAt }),
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
