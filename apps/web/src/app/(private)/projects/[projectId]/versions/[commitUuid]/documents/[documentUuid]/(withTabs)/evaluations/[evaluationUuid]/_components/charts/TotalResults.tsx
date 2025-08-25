import type { EvaluationV2Stats } from '@latitude-data/core/browser'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { ChartWrapper, PanelChart } from '@latitude-data/web-ui/molecules/Charts'

export default function TotalResultsChart({
  stats,
  isLoading,
}: {
  stats?: EvaluationV2Stats
  isLoading?: boolean
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
