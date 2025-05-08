import { EvaluationV2Stats } from '@latitude-data/core/browser'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import {
  ChartWrapper,
  PanelChart,
} from '@latitude-data/web-ui/molecules/Charts'

export default function TotalTokensChart({
  stats,
  isLoading,
}: {
  stats?: EvaluationV2Stats
  isLoading?: boolean
}) {
  return (
    <ChartWrapper
      label='Total tokens'
      tooltip='The total tokens of results logs for this evaluation'
      loading={isLoading}
    >
      {stats?.totalTokens !== undefined ? (
        <PanelChart data={stats.totalTokens} />
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
