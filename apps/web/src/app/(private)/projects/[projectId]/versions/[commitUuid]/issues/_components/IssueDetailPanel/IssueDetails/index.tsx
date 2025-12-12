import { SerializedIssue } from '$/stores/issues'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { HistogramCell } from '../../HistogramCell'
import { StatusBadges } from '../../IssueStatusBadge'
import { LastSeenCell } from '../../LastSeenCell'

export function IssueDetails({ issue }: { issue: SerializedIssue }) {
  const mergedToIssue = issue.mergedToIssue as
    | { id: number; title: string; uuid: string }
    | null
    | undefined

  const isMerged = issue.mergedAt && mergedToIssue

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
        <Text.H5 color='foregroundMuted'>Status</Text.H5>
        <div>
          <StatusBadges issue={issue} />
        </div>

        <Text.H5 color='foregroundMuted'>Last occurrence</Text.H5>
        <div>
          <LastSeenCell issue={issue} />
        </div>

        <Text.H5 color='foregroundMuted'>Trend</Text.H5>
        <HistogramCell issue={issue} loadingMiniStats={false} />

        <Text.H5 color='foregroundMuted'>Total events</Text.H5>
        <Text.H4M>{issue.totalCount}</Text.H4M>
      </div>
    </div>
  )
}
