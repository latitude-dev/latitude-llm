import { SerializedIssue } from '$/stores/issues'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { HistogramCell } from '../../HistogramCell'
import { StatusBadges } from '../../IssueStatusBadge'
import { LastSeenCell } from '../../LastSeenCell'

export function IssueDetails({ issue }: { issue: SerializedIssue }) {
  return (
    <div className='grid grid-cols-2 gap-x-4 gap-y-4 items-center'>
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
  )
}
