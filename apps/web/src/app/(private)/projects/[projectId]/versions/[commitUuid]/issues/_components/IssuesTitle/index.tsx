import { SerializedIssue } from '$/stores/issues'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  NEW_ISSUES_DAYS,
  RECENT_ISSUES_DAYS,
} from '@latitude-data/constants/issues'

function StatusBadge({ issue }: { issue: SerializedIssue }) {
  const isNew = issue.isNew
  const isEscalating = issue.isEscalating
  if (!isNew && !isEscalating) return null

  if (isNew) {
    return (
      <Tooltip trigger={<Badge variant='accent'>New</Badge>}>
        {`Has appeared in the last ${NEW_ISSUES_DAYS} days`}
      </Tooltip>
    )
  }

  return (
    <Tooltip trigger={<Badge variant='yellow'>Escalating</Badge>}>
      {`${issue.escalatingCount} events in the last ${RECENT_ISSUES_DAYS} days.`}
    </Tooltip>
  )
}

export function IssuesTitle({ issue }: { issue: SerializedIssue }) {
  return (
    <div className='flex items-center gap-x-2'>
      <StatusBadge issue={issue} />
      <Text.H5>{issue.title}</Text.H5>
    </div>
  )
}
