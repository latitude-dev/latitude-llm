import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { useCallback } from 'react'

import { useEvaluationParameters } from '../../../hooks/useEvaluationParamaters/index'
import { useSerializedLogs, type OnHistoryFetchedFn } from './useSerializedLogs'

/**
 * `selectedDocumentLogUuid` is the log that comes from
 * the URL when people link to the editor with that documentLog
 */
export function useLogHistoryParams({
  document,
  evaluation,
  commitVersionUuid,
  selectedDocumentLogUuid,
}: {
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  commitVersionUuid: string
  selectedDocumentLogUuid?: string
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
    logUuid: selectedDocumentLogUuid ?? logUuid,
    onHistoryFetched,
  })
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
