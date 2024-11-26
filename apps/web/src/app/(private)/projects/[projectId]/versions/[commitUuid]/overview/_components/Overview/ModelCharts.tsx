import { useMemo } from 'react'

import { BarChart, ChartBlankSlate, Text } from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'

import { ChartWrapper } from '../../../documents/[documentUuid]/evaluations/[evaluationId]/_components/MetricsSummary/Charts/ChartContainer'

type ModelStats = {
  runsPerModel: Record<string, number>
  costPerModel: Record<string, number>
  rollingDocumentLogs: { count: number; date: string }[]
}

export function ModelCharts({
  stats,
  isLoading,
}: {
  stats?: ModelStats
  isLoading: boolean
}) {
  const runsPerModelData = useMemo(() => {
    if (!stats?.runsPerModel) return []
    return Object.entries(stats.runsPerModel).map(([model, runs]) => ({
      x: model,
      y: runs,
    }))
  }, [stats?.runsPerModel])

  const costPerModelData = useMemo(() => {
    if (!stats?.costPerModel) return []
    return Object.entries(stats.costPerModel)
      .filter(([model]) => model !== 'unknown')
      .map(([model, cost]) => ({
        x: model,
        y: cost,
      }))
  }, [stats?.costPerModel])

  return (
    <div className='grid grid-cols-2 gap-4 h-[222px]'>
      <ChartWrapper label='Total runs per model' loading={isLoading}>
        {runsPerModelData.length > 0 && (
          <BarChart
            config={{
              xAxis: {
                label: 'Model',
                type: 'category',
              },
              yAxis: {
                label: 'Number of runs',
                type: 'number',
                min: 0,
              },
              data: runsPerModelData,
              tooltipContent: (item) => (
                <div className='flex flex-col gap-2'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Model</Text.H6B>
                    <Text.H6>{item.x}</Text.H6>
                  </div>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Runs</Text.H6B>
                    <Text.H6>{item.y}</Text.H6>
                  </div>
                </div>
              ),
            }}
          />
        )}
        {!runsPerModelData.length && (
          <ChartBlankSlate>No runs found so far.</ChartBlankSlate>
        )}
      </ChartWrapper>

      <ChartWrapper label='Total cost per model' loading={isLoading}>
        {costPerModelData.length > 0 && (
          <BarChart
            config={{
              xAxis: {
                label: 'Model',
                type: 'category',
              },
              yAxis: {
                label: 'Cost (USD)',
                type: 'number',
                min: 0,
                tickFormatter: (value) =>
                  `${formatCostInMillicents(Number(value))}`,
              },
              data: costPerModelData,
              tooltipContent: (item) => (
                <div className='flex flex-col gap-2'>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Model</Text.H6B>
                    <Text.H6>{item.x}</Text.H6>
                  </div>
                  <div className='flex w-full gap-2 justify-between'>
                    <Text.H6B>Cost</Text.H6B>
                    <Text.H6>
                      {formatCostInMillicents(Number(Number(item.y)))}
                    </Text.H6>
                  </div>
                </div>
              ),
            }}
          />
        )}
        {!costPerModelData.length && (
          <ChartBlankSlate>No cost data found so far.</ChartBlankSlate>
        )}
      </ChartWrapper>
    </div>
  )
}
