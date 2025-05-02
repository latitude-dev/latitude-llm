import { useCallback, useEffect, useMemo } from 'react'
import type { ConversationMetadata } from 'promptl-ai'
import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

import { EVALUATION_EMPTY_INPUTS, EvaluationInputsByDocument } from './types'
import { getDocState } from './utils'
import { useEvaluatedLogInputs } from './logInputParamaters'

export function useEvaluationParameters({
  commitVersionUuid,
  document,
  evaluation,
  metadata,
}: {
  commitVersionUuid: string
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  metadata?: ConversationMetadata | undefined
}) {
  const state = useEvaluatedLogInputs()
  const { value: allInputs, setValue } =
    useLocalStorage<EvaluationInputsByDocument>({
      key: AppLocalStorage.evaluationPlaygroundParameters,
      defaultValue: {},
    })
  const key = `${commitVersionUuid}:${document.documentUuid}:evaluation:${evaluation.uuid}`
  const inputs = allInputs[key] ?? EVALUATION_EMPTY_INPUTS
  const logUuid = inputs['history'].logUuid
  const setHistoryLog = useCallback(
    (logUuid: string) => {
      setValue((old) => {
        const { state, doc } = getDocState(old, key)
        return {
          ...state,
          [key]: {
            ...doc,
            history: {
              ...doc.history,
              logUuid,
            },
          },
        }
      })
    },
    [key, setValue],
  )

  const onMetadataChange = state.onMetadataChange

  useEffect(() => {
    onMetadataChange(metadata)
  }, [metadata, onMetadataChange])

  return useMemo(
    () => ({
      parametersReady: state.logsInitiallyLoaded,
      parameters: state.filteredParameters,
      history: {
        logUuid: logUuid,
        setHistoryLog,
        inputs: state.inputs,
        expectedOutput: state.expectedOutput,
        setInputs: state.setInputs,
        mapLogParametersToInputs: state.mapLogParametersToInputs,
      },
    }),
    [
      logUuid,
      setHistoryLog,
      state.expectedOutput,
      state.filteredParameters,
      state.inputs,
      state.setInputs,
      state.logsInitiallyLoaded,
      state.mapLogParametersToInputs,
    ],
  )
}
export type UseEvaluationParameters = ReturnType<typeof useEvaluationParameters>
