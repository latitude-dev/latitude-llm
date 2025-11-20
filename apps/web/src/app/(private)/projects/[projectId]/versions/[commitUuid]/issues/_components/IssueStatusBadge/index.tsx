import { useMemo } from 'react'
import { format } from 'date-fns'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { NEW_ISSUES_DAYS } from '@latitude-data/constants/issues'
import { SerializedIssue } from '$/stores/issues'
import {
  DotIndicator,
  DotIndicatorProps,
} from '@latitude-data/web-ui/atoms/DotIndicator'

type StatusTriggerProps = {
  label: string
  dotProps: DotIndicatorProps
  tooltip?: string
  badgeVariant?: BadgeProps['variant']
}

function StatusTrigger({ label, dotProps, badgeVariant }: StatusTriggerProps) {
  return (
    <Badge shape='rounded' variant={badgeVariant ?? 'noBorderMuted'}>
      <div className='flex flex-row gap-x-1 px-0.5 items-center font-medium'>
        <DotIndicator variant={dotProps.variant} />
        <span>{label}</span>
      </div>
    </Badge>
  )
}

export function StatusBadges({ issue }: { issue: SerializedIssue }) {
  const statuses = useMemo<StatusTriggerProps[]>(() => {
    const result: StatusTriggerProps[] = []

    // If is regressed we dont show resolved even if both are true
    if (issue.isRegressed) {
      result.push({
        label: 'Regressed',
        dotProps: { variant: 'fucksia' },
        tooltip: issue.resolvedAt
          ? `Was resolved on ${format(issue.resolvedAt, 'PPpp')} but last that occurred was on ${format(issue.lastSeenDate, 'PPpp')}.`
          : 'Was resolved but reoccurred.',
      })
    } else if (issue.isResolved) {
      result.push({
        label: 'Resolved',
        dotProps: { variant: 'resolved' },
        tooltip: issue.resolvedAt
          ? `Was resolved on ${format(issue.resolvedAt, 'PPpp')}.`
          : 'Was resolved.',
      })
    }

    if (issue.isIgnored) {
      result.push({
        label: 'Ignored',
        dotProps: { variant: 'muted' },
        tooltip: issue.ignoredAt
          ? `Someone in your team has chosen to ignore this issue. It was ignored on ${format(issue.ignoredAt, 'PPpp')}.`
          : "Someone in your team has chosen to ignore this issue. Ignore issues don't run automatic alerts.",
      })
    }

    if (issue.isEscalating) {
      result.push({
        label: 'Escalating',
        tooltip: 'Increasing frequency of occurrences for this issue.',
        dotProps: { variant: 'destructive' },
        badgeVariant: 'noBorderDestructiveMuted',
      })
    }

    if (issue.isNew && !issue.isIgnored && !issue.isResolved) {
      result.push({
        label: 'New',
        tooltip: `Has appeared in the last ${NEW_ISSUES_DAYS} days`,
        dotProps: { variant: 'new' },
      })
    }

    return result
  }, [issue])

  if (statuses.length === 0) return null

  return (
    <div className='flex flex-row gap-x-2'>
      {statuses.map((status, index) => {
        if (!status.tooltip) {
          return (
            <StatusTrigger
              key={`${status.label}-${index}`}
              label={status.label}
              dotProps={status.dotProps}
              badgeVariant={status.badgeVariant}
            />
          )
        }

        return (
          <Tooltip
            key={`${status.label}-${index}`}
            trigger={
              <StatusTrigger
                label={status.label}
                dotProps={status.dotProps}
                badgeVariant={status.badgeVariant}
              />
            }
          >
            {status.tooltip}
          </Tooltip>
        )
      })}
    </div>
  )
}
