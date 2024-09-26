'use client'

import { useCallback } from 'react'

import { EvaluationModalValue } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui'
import useEvaluationResultsModalValue from '$/stores/evaluationResultCharts/evaluationResultsModalValue'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function ModalValuePanel({
  modal,
  commitUuid,
  documentUuid,
  evaluationId,
}: {
  commitUuid: string
  documentUuid: string
  evaluationId: number
  modal: EvaluationModalValue
}) {
  const { data, refetch } = useEvaluationResultsModalValue(
    {
      commitUuid,
      documentUuid,
      evaluationId,
    },
    {
      fallbackData: modal,
    },
  )
  const onStatusChange = useCallback(() => refetch(), [refetch])
  useEvaluationStatusEvent({ evaluationId, documentUuid, onStatusChange })
  return (
    <Panel
      label='Value more repeated'
      additionalInfo='Value more repeated in the evaluation results.'
    >
      <Text.H3B>{data?.mostCommon ?? '-'}</Text.H3B>
      <Text.H3 color='foregroundMuted'>
        {' '}
        It appeared ({data?.percentage ?? '0'}%)
      </Text.H3>
    </Panel>
  )
}
