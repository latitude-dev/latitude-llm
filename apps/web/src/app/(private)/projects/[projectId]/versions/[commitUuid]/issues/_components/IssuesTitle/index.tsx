import { useMemo } from 'react'
import { SerializedIssue } from '$/stores/issues'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { format } from 'date-fns'
import {
  ESCALATING_COUNT_THRESHOLD,
  NEW_ISSUES_DAYS,
  RECENT_ISSUES_DAYS,
} from '@latitude-data/constants/issues'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
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

function StatusBadges({ issue }: { issue: SerializedIssue }) {
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
        tooltip: `Increasing frequency with ${issue.escalatingCount} events in the last ${RECENT_ISSUES_DAYS} days. Limit for consideration is more than ${ESCALATING_COUNT_THRESHOLD} events.`,
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
    <>
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
    </>
  )
}

export function formatDocumentPath(path: string): string {
  const cleanPath = path.replace(/\.promptl$/, '')
  const segments = cleanPath.split('/')

  if (segments.length === 1) return segments[0]

  const filename = segments[segments.length - 1]
  const firstFolder = segments[0]

  if (segments.length === 2) {
    return `${firstFolder}/${filename}`
  }

  return `${firstFolder}/.../${filename}`
}

function DocumentPath({ issue }: { issue: SerializedIssue }) {
  const { data: document } = useDocumentVersion(issue.documentUuid)
  const path = useMemo(
    () => (document ? formatDocumentPath(document.path) : null),
    [document],
  )

  if (!path) return null

  return (
    <div className='flex flex-row items-center gap-x-1'>
      <Icon name='bot' />
      <Text.H5 color='foregroundMuted'>{path}</Text.H5>
    </div>
  )
}

export function IssuesTitle({ issue }: { issue: SerializedIssue }) {
  return (
    <div className='flex flex-col justify-start items-start gap-y-1 py-4'>
      <Text.H5>{issue.title}</Text.H5>
      <div className='flex items-center gap-x-2'>
        <StatusBadges issue={issue} />
        <DocumentPath issue={issue} />
      </div>
    </div>
  )
}
