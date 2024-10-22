'use client'

import { useCallback } from 'react'

import {
  EvaluationDtoLlmAsJudgeLegacy,
  EvaluationDtoLlmAsJudgeNumerical,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import { RangeBadge } from '@latitude-data/web-ui'
import useEvaluationResultsMeanValue from '$/stores/evaluationResultCharts/evaluationResultsMeanValue'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function MeanValuePanel({
  commitUuid,
  documentUuid,
  evaluation,
}: {
  commitUuid: string
  documentUuid: string
  evaluation: EvaluationDtoLlmAsJudgeLegacy | EvaluationDtoLlmAsJudgeNumerical
}) {
  const { data, refetch, isLoading } = useEvaluationResultsMeanValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
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
  useEvaluationStatusEvent({
    evaluationId: evaluation.id,
    documentUuid,
    onStatusChange,
  })
  const defaultMinValue =
    evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeLegacy
      ? (evaluation.metadata.configuration.detail?.range?.from ?? 0)
      : evaluation.metadata.minValue
  const defaultMaxValue =
    evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeLegacy
      ? (evaluation.metadata.configuration.detail?.range?.to ?? 10)
      : evaluation.metadata.maxValue
  return (
    <Panel
      label='Current average'
      additionalInfo='The mean value of all the evaluated results from the current version.'
    >
      <div className='w-fit'>
        <RangeBadge
          loading={isLoading}
          minValue={data?.minValue ?? defaultMinValue}
          maxValue={data?.maxValue ?? defaultMaxValue}
          value={data?.meanValue ?? 0}
        />
      </div>
    </Panel>
  )
}
