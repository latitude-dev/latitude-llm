import { EvaluationV2Stats } from '@latitude-data/core/browser'
import {
  ChartBlankSlate,
  ChartWrapper,
  PanelChart,
} from '@latitude-data/web-ui'

export default function TotalResultsChart({
  stats,
  isLoading,
}: {
  stats?: EvaluationV2Stats
  isLoading: boolean
}) {
  return (
    <ChartWrapper
      label='Total results'
      tooltip='The total number of logs evaluated for this evaluation'
      loading={isLoading}
    >
      {stats?.totalResults !== undefined ? (
        <PanelChart data={stats.totalResults} />
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
