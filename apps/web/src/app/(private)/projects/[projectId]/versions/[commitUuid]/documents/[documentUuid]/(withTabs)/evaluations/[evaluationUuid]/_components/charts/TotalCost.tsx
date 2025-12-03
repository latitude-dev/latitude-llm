import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'
import {
  ChartWrapper,
  PanelChart,
} from '@latitude-data/web-ui/molecules/Charts'
import { EvaluationV2Stats } from '@latitude-data/core/schema/types'
import { Text } from '@latitude-data/web-ui/atoms/Text'

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
      tooltip='The total tokens and cost of results logs for this evaluation'
      loading={isLoading}
    >
      {stats?.totalCost !== undefined && stats?.totalTokens !== undefined ? (
        <div className='flex flex-col'>
          <Text.H6M color='foregroundMuted'>
            {stats.totalTokens} tokens
          </Text.H6M>
          <PanelChart data={formatCostInMillicents(stats.totalCost)} />
        </div>
      ) : (
        <ChartBlankSlate>No logs evaluated so far</ChartBlankSlate>
      )}
    </ChartWrapper>
  )
}
