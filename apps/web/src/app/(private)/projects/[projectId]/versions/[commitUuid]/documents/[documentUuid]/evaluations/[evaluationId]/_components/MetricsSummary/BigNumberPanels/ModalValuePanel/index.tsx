'use client'

import { useCallback } from 'react'

import { Skeleton, Text } from '@latitude-data/web-ui'
import useEvaluationResultsModalValue from '$/stores/evaluationResultCharts/evaluationResultsModalValue'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function ModalValuePanel({
  commitUuid,
  documentUuid,
  evaluationId,
}: {
  commitUuid: string
  documentUuid: string
  evaluationId: number
}) {
  const { data, refetch, isLoading } = useEvaluationResultsModalValue(
    {
      commitUuid,
      documentUuid,
      evaluationId,
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnMount: false,
    },
  )
  const onStatusChange = useDebouncedCallback(
    useCallback(() => refetch(), [refetch]),
    2000,
    { trailing: true },
  )
  useEvaluationStatusEvent({ evaluationId, documentUuid, onStatusChange })
  return (
    <Panel
      label='Value more repeated'
      additionalInfo={
        data?.percentage
          ? `It appeared in ${data?.percentage}% of instances`
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
