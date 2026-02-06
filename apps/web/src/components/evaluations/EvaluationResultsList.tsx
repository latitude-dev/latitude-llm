import { ComponentType } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
} from '@latitude-data/constants'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import { MetadataItem } from '$/components/MetadataItem'
import ResultBadge from '$/components/evaluations/ResultBadge'

export type EvaluationResultActionsProps = {
  item: ResultWithEvaluationV2
}

export function EvaluationResultDetails<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  result,
  evaluation,
}: {
  result: ResultWithEvaluationV2<T, M>['result']
  evaluation: ResultWithEvaluationV2<T, M>['evaluation']
}) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) return null

  return (
    <div className='flex flex-col gap-2.5'>
      <MetadataItem label='Type' value={typeSpecification.name} />
      <MetadataItem label='Metric' value={metricSpecification.name} />
      {result.error ? (
        <MetadataItem
          label='Error'
          value={result.error.message}
          color='destructiveMutedForeground'
          stacked
        />
      ) : (
        <>
          <MetadataItem label='Result'>
            <ResultBadge evaluation={evaluation} result={result} />
          </MetadataItem>
          <MetadataItem
            label='Reasoning'
            value={
              metricSpecification.resultReason(
                result as EvaluationResultSuccessValue<T, M>,
              ) || 'No reason reported'
            }
            stacked
            collapsible
          />
        </>
      )}
    </div>
  )
}

export function EvaluationResultsList({
  results,
  isLoading,
  emptyMessage = 'There are no evaluation results',
  actions: Actions,
}: {
  results: ResultWithEvaluationV2[]
  isLoading?: boolean
  emptyMessage?: string
  actions?: ComponentType<EvaluationResultActionsProps>
}) {
  if (isLoading) {
    return <LoadingText alignX='center' />
  }

  if (!results.length) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          {emptyMessage}
        </Text.H5>
      </div>
    )
  }

  return (
    <ul className='flex flex-col gap-4 divide-y divide-border'>
      {results.map((item) => (
        <li
          key={item.result.uuid}
          className='flex flex-col gap-2 pt-4 first:pt-0'
        >
          <span className='flex justify-between items-center gap-2 w-full'>
            <span className='flex justify-center items-center gap-1.5'>
              <Icon
                name={getEvaluationMetricSpecification(item.evaluation).icon}
                color='foreground'
                className='flex-shrink-0'
              />
              <Text.H4M noWrap ellipsis>
                {item.evaluation.name}
              </Text.H4M>
            </span>
            {Actions && <Actions item={item} />}
          </span>
          <EvaluationResultDetails
            result={item.result}
            evaluation={item.evaluation}
          />
        </li>
      ))}
    </ul>
  )
}
