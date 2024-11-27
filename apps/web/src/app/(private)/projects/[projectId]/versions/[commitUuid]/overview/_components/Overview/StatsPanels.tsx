import { ProjectStats } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'

import Panel from '../../../documents/[documentUuid]/evaluations/[evaluationId]/_components/MetricsSummary/BigNumberPanels/Panel'
import { EvaluationStats } from './EvaluationStats'
import { LogsOverTime } from './LogsOverTime'
import { ModelCharts } from './ModelCharts'

export function StatsPanels({
  stats,
  isLoading,
}: {
  stats?: ProjectStats
  isLoading: boolean
}) {
  const totalCost = stats
    ? Object.values(stats.costPerModel ?? {}).reduce<number>(
        (acc, curr) => acc + curr,
        0,
      )
    : 0

  return (
    <div className='flex flex-col gap-8 w-full'>
      <div className='flex flex-col gap-4'>
        <Text.H5>Logs</Text.H5>
        <div className='grid grid-cols-3 gap-4'>
          <LogsOverTime
            data={stats?.rollingDocumentLogs?.map((r) => ({
              date: new Date(r.date),
              count: r.count,
            }))}
            isLoading={!stats && isLoading}
          />
          <div className='grid grid-cols-1 gap-4'>
            <Panel
              label='Prompts'
              additionalInfo='The total number of prompts in this project, including deleted ones.'
              loading={!stats && isLoading}
              value={String(stats?.totalDocuments ?? '-')}
            />
            <Panel
              label='Total logs'
              additionalInfo='The total number of logs across all prompts, including deleted prompts.'
              loading={!stats && isLoading}
              value={String(stats?.totalRuns ?? '-')}
            />
          </div>
          <div className='grid grid-cols-1 gap-4'>
            <Panel
              label='Total tokens'
              additionalInfo='The total number of tokens processed across all logs, including deleted prompts.'
              loading={!stats && isLoading}
              value={String(stats?.totalTokens ?? '-')}
            />
            <Panel
              label='Total cost'
              additionalInfo='The cumulative cost of all logs, including from deleted prompts.'
              loading={!stats && isLoading}
              value={stats ? formatCostInMillicents(totalCost) : '-'}
            />
          </div>
        </div>

        <ModelCharts stats={stats} isLoading={!stats && isLoading} />
      </div>

      <div className='flex flex-col gap-4'>
        <Text.H5>Evaluations</Text.H5>
        <EvaluationStats stats={stats} isLoading={!stats && isLoading} />
      </div>
    </div>
  )
}
