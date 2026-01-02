import { CommitVersionCell } from '$/components/CommitVersionCell'
import { ROUTES } from '$/services/routes'
import { SerializedIssue } from '$/stores/issues'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { HistogramCell } from '../../HistogramCell'
import { StatusBadges, useIssueStatuses } from '../../IssueStatusBadge'
import { LastSeenCell } from '../../LastSeenCell'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function IssueDetails({ issue }: { issue: SerializedIssue }) {
  const mergedToIssue = issue.mergedToIssue as
    | { id: number; title: string; uuid: string }
    | null
    | undefined

  const isMerged = issue.mergedAt && mergedToIssue
  const statuses = useIssueStatuses({ issue })

  return (
    <div className='flex flex-col gap-y-6'>
      {isMerged && mergedToIssue ? (
        <Alert
          variant='default'
          showIcon
          title='Merged issue'
          description={`This issue was merged into "${mergedToIssue.title}"`}
          cta={
            <Link
              href={`?issueId=${mergedToIssue.id}&status=active`}
              target='_blank'
            >
              <Button variant='outline' size='small'>
                View issue
              </Button>
            </Link>
          }
          direction='row'
          spacing='small'
        />
      ) : null}
      <div className='grid grid-cols-2 gap-y-4 items-center'>
        {statuses.length > 0 ? (
          <>
            <Text.H5 color='foregroundMuted'>Status</Text.H5>
            <div>
              <StatusBadges statuses={statuses} />
            </div>
          </>
        ) : null}

        <Text.H5 color='foregroundMuted'>Last occurrence</Text.H5>
        <div>
          <LastSeenCell issue={issue} />
        </div>

        <Text.H5 color='foregroundMuted'>Last version</Text.H5>
        <div>
          <Link
            className='flex items-center gap-2'
            href={
              ROUTES.projects
                .detail({ id: issue.projectId })
                .commits.detail({ uuid: issue.lastCommit.uuid })
                .documents.detail({ uuid: issue.documentUuid }).root
            }
          >
            <CommitVersionCell commit={issue.lastCommit} />
            <Icon name='externalLink' />
          </Link>
        </div>

        <Text.H5 color='foregroundMuted'>Trend</Text.H5>
        <HistogramCell issue={issue} loadingMiniStats={false} />

        <Text.H5 color='foregroundMuted'>Total events</Text.H5>
        <Text.H4M>{issue.totalCount}</Text.H4M>
      </div>
    </div>
  )
}
