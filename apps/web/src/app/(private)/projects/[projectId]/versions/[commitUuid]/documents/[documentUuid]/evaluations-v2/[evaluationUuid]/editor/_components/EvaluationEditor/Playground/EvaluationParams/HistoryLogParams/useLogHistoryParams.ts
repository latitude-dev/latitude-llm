import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { useCallback } from 'react'

import { useEvaluationParameters } from '../../../hooks/useEvaluationParamaters/index'
import { useSerializedLogs, type OnHistoryFetchedFn } from './useSerializedLogs'

export function useLogHistoryParams({
  document,
  evaluation,
  commitVersionUuid,
}: {
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  commitVersionUuid: string
}) {
  const {
    history: { setHistoryLog, logUuid, mapLogParametersToInputs },
  } = useEvaluationParameters({
    document,
    evaluation,
    commitVersionUuid,
  })

  const onHistoryFetched: OnHistoryFetchedFn = useCallback(
    (log) => {
      mapLogParametersToInputs(log)
      setHistoryLog(log.uuid)
    },
    [setHistoryLog, mapLogParametersToInputs],
  )
  return useSerializedLogs({
    document,
    logUuid,
    onHistoryFetched,
  })
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
