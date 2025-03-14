'use client'

import { useCallback } from 'react'

import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useEvaluationResultsCounters from '$/stores/evaluationResultCharts/evaluationResultsCounters'
import {
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function TotalsPanels({
  commitUuid,
  documentUuid,
  evaluation,
}: {
  commitUuid: string
  documentUuid: string
  evaluation: EvaluationDto
}) {
  const { data, refetch, isLoading } = useEvaluationResultsCounters(
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

  const cost =
    data?.costInMillicents === undefined
      ? '-'
      : formatCostInMillicents(data.costInMillicents)

  return (
    <>
      <Panel
        label='Total evaluated logs'
        additionalInfo='The total number of logs evaluated for this document.'
        loading={isLoading}
        value={String(data?.totalCount ?? '-')}
      />
      {evaluation &&
        evaluation?.metadataType !== EvaluationMetadataType.Manual && (
          <>
            <Panel label='Total cost' loading={isLoading} value={cost} />
            <Panel
              label='Total tokens'
              loading={isLoading}
              value={String(data?.tokens ?? '-')}
            />
          </>
        )}
    </>
  )
}
