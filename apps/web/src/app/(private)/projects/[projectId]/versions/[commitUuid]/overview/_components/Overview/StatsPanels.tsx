import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { EvaluationStats } from './EvaluationStats'
import { LogsOverTime } from './LogsOverTime'
import { ModelCharts } from './ModelCharts'
import Panel from '$/components/Panel'
import { ProjectStats } from '@latitude-data/core/schema/types'

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
            data={stats?.rollingDocumentLogs}
            isLoading={isLoading}
          />
          <div className='grid grid-cols-1 gap-4'>
            <Panel
              label='Prompts'
              additionalInfo='The total number of prompts across all versions, including deleted ones.'
              loading={isLoading}
              value={String(stats?.totalDocuments ?? '-')}
            />
            <Panel
              label='Total logs'
              additionalInfo='The total number of prompt logs across all versions, including deleted prompts.'
              loading={isLoading}
              value={String(stats?.totalRuns ?? '-')}
            />
          </div>
          <div className='grid grid-cols-1 gap-4'>
            <Panel
              label='Total tokens'
              additionalInfo='The total number of tokens processed in prompt runs across all versions, including deleted prompts.'
              loading={isLoading}
              value={String(stats?.totalTokens ?? '-')}
            />
            <Panel
              label='Total cost'
              additionalInfo='The cumulative cost of all prompt runs across all versions, including from deleted prompts.'
              loading={isLoading}
              value={stats ? formatCostInMillicents(totalCost) : '-'}
            />
          </div>
        </div>

        <ModelCharts stats={stats} isLoading={isLoading} />
      </div>

      <div className='flex flex-col gap-4'>
        <Text.H5>Evaluations</Text.H5>
        <EvaluationStats stats={stats} isLoading={isLoading} />
      </div>
    </div>
  )
}
