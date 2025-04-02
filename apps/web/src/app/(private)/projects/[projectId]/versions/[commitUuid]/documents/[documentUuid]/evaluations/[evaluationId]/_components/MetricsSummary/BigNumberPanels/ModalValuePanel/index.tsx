'use client'
import { useCallback } from 'react'

import useEvaluationResultsModalValue from '$/stores/evaluationResultCharts/evaluationResultsModalValue'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useDebouncedCallback } from 'use-debounce'

import { EvaluationDto } from '@latitude-data/core/browser'
import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function ModalValuePanel({
  commitUuid,
  documentUuid,
  evaluation,
}: {
  commitUuid: string
  documentUuid: string
  evaluation: EvaluationDto
}) {
  const { data, refetch, isLoading } = useEvaluationResultsModalValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )
  const onStatusChange = useDebouncedCallback(
    useCallback(() => refetch(), [refetch]),
    2000,
    { trailing: true },
  )
  useEvaluationStatusEvent({
    evaluation: { ...evaluation, version: 'v1' },
    documentUuid,
    onStatusChange,
  })
  return (
    <Panel
      label='Value more repeated'
      additionalInfo={
        data?.percentage
          ? `It appeared in ${data.percentage}% of instances`
          : undefined
      }
    >
      {isLoading ? (
        <Skeleton className='mt-4 w-16' height='h4' />
      ) : (
        <div className='flex flex-row gap-2 items-center'>
          <Text.H3B>{data?.mostCommon ?? '-'}</Text.H3B>
          {!!data?.percentage && (
            <Text.H6 color='foregroundMuted'>({data?.percentage}%)</Text.H6>
          )}
        </div>
      )}
    </Panel>
  )
}
