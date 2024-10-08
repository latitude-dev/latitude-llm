'use client'

import { useCallback } from 'react'

import { EvaluationDto, EvaluationMeanValue } from '@latitude-data/core/browser'
import { RangeBadge } from '@latitude-data/web-ui'
import useEvaluationResultsMeanValue from '$/stores/evaluationResultCharts/evaluationResultsMeanValue'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function MeanValuePanel({
  mean,
  commitUuid,
  documentUuid,
  evaluation,
}: {
  commitUuid: string
  documentUuid: string
  evaluation: EvaluationDto
  mean: EvaluationMeanValue
}) {
  const { data, refetch } = useEvaluationResultsMeanValue(
    {
      commitUuid,
      documentUuid,
      evaluationId: evaluation.id,
    },
    {
      fallbackData: mean,
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
  const config = evaluation.configuration.detail!
  const defaultMinValue = config.range.from
  const defaultMaxValue = config.range.to
  return (
    <Panel
      label='Current average'
      additionalInfo='The mean value of all the evaluated results from the current version.'
    >
      <div className='w-fit'>
        <RangeBadge
          minValue={data?.minValue ?? defaultMinValue}
          maxValue={data?.maxValue ?? defaultMaxValue}
          value={data?.meanValue ?? 0}
        />
      </div>
    </Panel>
  )
}
