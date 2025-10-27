import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import Panel from '$/components/Panel'

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
    <div className='grid grid-rows-2 gap-4'>
      <div className='grid grid-cols-3 gap-4'>
        <Panel
          label='Total traces'
          additionalInfo='The total number of traces recorded for this document across all executions.'
          loading={isLoading}
          value={String(aggregations?.totalCount ?? '-')}
        />
        <Panel
          label='Total cost'
          additionalInfo='The cumulative cost of all trace executions for this document, including both input and output tokens.'
          loading={isLoading}
          value={
            aggregations?.totalCostInMillicents === undefined
              ? '-'
              : formatCostInMillicents(aggregations.totalCostInMillicents)
          }
        />
        <Panel
          label='Average time'
          additionalInfo='The mean execution time across all traces, calculated by summing all durations and dividing by the total number of traces.'
          loading={isLoading}
          value={
            aggregations?.averageDuration === undefined
              ? '-'
              : formatDuration(aggregations.averageDuration)
          }
        />
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <Panel
          label='Total tokens'
          additionalInfo='The total number of tokens processed across all traces, including prompt, cached, reasoning, and completion tokens.'
          loading={isLoading}
          value={String(aggregations?.totalTokens ?? '-')}
        />
        <Panel
          label='Median cost'
          additionalInfo='The median cost represents the central cost value, where 50% of traces cost more and 50% cost less, providing a balanced measure of typical cost per trace.'
          loading={isLoading}
          value={
            aggregations?.medianCostInMillicents === undefined
              ? '-'
              : formatCostInMillicents(aggregations.medianCostInMillicents)
          }
        />
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
  )
}
