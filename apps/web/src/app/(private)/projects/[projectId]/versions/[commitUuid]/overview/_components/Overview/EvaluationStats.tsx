import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BarChart, ChartWrapper } from '@latitude-data/web-ui/molecules/Charts'
import { ChartBlankSlate } from '@latitude-data/web-ui/atoms/ChartBlankSlate'

import { useMemo } from 'react'
import Panel from '$/components/Panel'
import { ProjectStats } from '@latitude-data/core/schema/models/types/Project'

export function EvaluationStats({
  stats,
  isLoading,
}: {
  stats?: ProjectStats
  isLoading: boolean
}) {
  const costPerEvaluationData = useMemo(() => {
    if (!stats?.costPerEvaluation) return []
    return Object.entries(stats.costPerEvaluation).map(
      ([evaluation, cost]) => ({
        x: evaluation,
        y: cost,
      }),
    )
  }, [stats?.costPerEvaluation])

  return (
    <div className='flex flex-col gap-4 min-h-[222px]'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='grid grid-cols-1 gap-4'>
          <Panel
            label='Evaluations'
            additionalInfo='The total number of evaluations across all versions, including deleted ones.'
            loading={isLoading}
            value={String(stats?.totalEvaluations ?? '-')}
          />
          <Panel
            label='Total results'
            additionalInfo='The total number of evaluation results across all versions, including deleted evaluations.'
            loading={isLoading}
            value={String(stats?.totalEvaluationResults ?? '-')}
          />
        </div>
        <ChartWrapper label='Total cost per evaluation' loading={isLoading}>
          {costPerEvaluationData.length > 0 && (
            <BarChart
              config={{
                xAxis: {
                  label: 'Evaluation',
                  type: 'category',
                },
                yAxis: {
                  label: 'Cost (USD)',
                  type: 'number',
                  min: 0,
                  tickFormatter: (value) =>
                    formatCostInMillicents(Number(value)),
                },
                data: costPerEvaluationData,
                tooltipContent: (item) => (
                  <div className='flex flex-col gap-2'>
                    <div className='flex w-full gap-2 justify-between'>
                      <Text.H6B>Evaluation</Text.H6B>
                      <Text.H6>{item.x}</Text.H6>
                    </div>
                    <div className='flex w-full gap-2 justify-between'>
                      <Text.H6B>Cost</Text.H6B>
                      <Text.H6>
                        {formatCostInMillicents(Number(item.y))}
                      </Text.H6>
                    </div>
                  </div>
                ),
              }}
            />
          )}
          {!costPerEvaluationData.length && (
            <ChartBlankSlate>No evaluation costs found so far.</ChartBlankSlate>
          )}
        </ChartWrapper>
      </div>
    </div>
  )
}
