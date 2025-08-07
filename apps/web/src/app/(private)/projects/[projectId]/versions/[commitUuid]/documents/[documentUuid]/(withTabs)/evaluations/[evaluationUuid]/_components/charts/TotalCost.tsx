import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import type { EvaluationV2Stats } from '@latitude-data/core/browser'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import { ChartWrapper, PanelChart } from '@latitude-data/web-ui/molecules/Charts'

export default function TotalCostChart({
  stats,
  isLoading,
}: {
  stats?: EvaluationV2Stats
  isLoading?: boolean
}) {
  return (
    <ChartWrapper
      label='Total cost'
      tooltip='The total cost of results logs for this evaluation'
      loading={isLoading}
    >
      {stats?.totalCost !== undefined ? (
        <PanelChart data={formatCostInMillicents(stats.totalCost)} />
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
