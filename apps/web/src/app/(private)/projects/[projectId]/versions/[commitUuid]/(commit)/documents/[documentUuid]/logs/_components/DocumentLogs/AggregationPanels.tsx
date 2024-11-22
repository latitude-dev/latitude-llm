import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'

import Panel from '../../../evaluations/[evaluationId]/_components/MetricsSummary/BigNumberPanels/Panel'

export function AggregationPanels({
  aggregations,
  isLoading,
}: {
  aggregations?: {
    totalCount: number
    totalTokens: number
    totalCostInMillicents: number
    averageTokens: number
    averageCostInMillicents: number
    medianCostInMillicents: number
    averageDuration: number
    medianDuration: number
  }
  isLoading: boolean
}) {
  return (
    <div className='flex flex-col gap-6 mb-4'>
      <div className='flex gap-6'>
        <div className='flex-1'>
          <Panel
            label='Total logs'
            additionalInfo='The total number of logs recorded for this document across all executions.'
            loading={isLoading}
            value={String(aggregations?.totalCount ?? '-')}
          />
        </div>
        <div className='flex-1'>
          <Panel
            label='Total cost'
            additionalInfo='The cumulative cost of all log executions for this document, including both input and output tokens.'
            loading={isLoading}
            value={
              aggregations?.totalCostInMillicents === undefined
                ? '-'
                : formatCostInMillicents(aggregations.totalCostInMillicents)
            }
          />
        </div>
        <div className='flex-1'>
          <Panel
            label='Average time'
            additionalInfo='The mean execution time across all logs, calculated by summing all durations and dividing by the total number of logs.'
            loading={isLoading}
            value={
              aggregations?.averageDuration === undefined
                ? '-'
                : formatDuration(aggregations.averageDuration)
            }
          />
        </div>
      </div>

      <div className='flex gap-6'>
        <div className='flex-1'>
          <Panel
            label='Total tokens'
            additionalInfo='The total number of tokens processed across all logs, including both input and output tokens.'
            loading={isLoading}
            value={String(aggregations?.totalTokens ?? '-')}
          />
        </div>
        <div className='flex-1'>
          <Panel
            label='Median cost'
            additionalInfo='The median cost represents the central cost value, where 50% of logs cost more and 50% cost less, providing a balanced measure of typical cost per log.'
            loading={isLoading}
            value={
              aggregations?.medianCostInMillicents === undefined
                ? '-'
                : formatCostInMillicents(aggregations.medianCostInMillicents)
            }
          />
        </div>
        <div className='flex-1'>
          <Panel
            label='Median time'
            additionalInfo='The middle value of all execution durations when ordered from shortest to longest, providing a typical duration unaffected by extreme outliers.'
            loading={isLoading}
            value={
              aggregations?.medianDuration === undefined
                ? '-'
                : formatDuration(aggregations.medianDuration)
            }
          />
        </div>
      </div>
    </div>
  )
}
