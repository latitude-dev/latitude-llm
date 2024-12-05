import { ProjectStats } from '@latitude-data/core/browser'
import { BarChart, ChartBlankSlate, Text } from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'

import Panel from '../../../../(commit)/documents/[documentUuid]/evaluations/[evaluationId]/_components/MetricsSummary/BigNumberPanels/Panel'
import { ChartWrapper } from '../../../../(commit)/documents/[documentUuid]/evaluations/[evaluationId]/_components/MetricsSummary/Charts/ChartContainer'

export function EvaluationStats({
  stats,
  isLoading,
}: {
  stats?: ProjectStats
  isLoading: boolean
}) {
  const evaluationCostData =
    stats?.evaluationCosts.map(
      (item: { evaluationName: string; cost: number }) => ({
        x: item.evaluationName,
        y: item.cost,
      }),
    ) ?? []

  return (
    <div className='flex flex-col gap-4 min-h-[400px]'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='grid grid-cols-1 gap-4'>
          <Panel
            label='Connected Evaluations'
            additionalInfo='The number of evaluations connected to prompts in this project.'
            loading={isLoading}
            value={String(stats?.totalEvaluations ?? '-')}
          />
          <Panel
            label='Total evaluation runs'
            additionalInfo='The number of evaluation results computed across all evaluations in this project.'
            loading={isLoading}
            value={String(stats?.totalEvaluationRuns ?? '-')}
          />
        </div>
        <ChartWrapper label='Total cost per evaluation' loading={isLoading}>
          {evaluationCostData.length > 0 && (
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
                data: evaluationCostData,
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
          {!evaluationCostData.length && (
            <ChartBlankSlate>No evaluation costs found so far.</ChartBlankSlate>
          )}
        </ChartWrapper>
      </div>
    </div>
  )
}
