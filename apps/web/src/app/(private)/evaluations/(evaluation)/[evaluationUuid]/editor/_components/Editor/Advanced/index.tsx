'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import {
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataType,
  ProviderApiKey,
  SERIALIZED_DOCUMENT_LOG_FIELDS,
} from '@latitude-data/core/browser'
import {
  Button,
  DocumentTextEditor,
  DocumentTextEditorFallback,
} from '@latitude-data/web-ui'
import EditorHeader from '$/components/EditorHeader'
import { useMetadata } from '$/hooks/useMetadata'
import useEvaluations from '$/stores/evaluations'
import useProviderApiKeys from '$/stores/providerApiKeys'

export default function AdvancedEvaluationEditor({
  evaluationUuid,
  defaultPrompt,
  providerApiKeys,
  freeRunsCount,
}: {
  evaluationUuid: string
  defaultPrompt: string
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
}) {
  const { findEvaluation, isLoading, update, isUpdating } = useEvaluations()
  const evaluation = findEvaluation(evaluationUuid)!
  const evaluationMetadata = useMemo(
    () => evaluation?.metadata as EvaluationMetadataLlmAsJudgeAdvanced,
    [evaluation],
  )
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const [value, setValue] = useState(defaultPrompt)
  const { metadata, runReadMetadata } = useMetadata()

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
    })
  }, [providers, runReadMetadata])

  const save = useCallback(
    (val: string) => {
      update({
        id: evaluation!.id,
        metadata: {
          type: EvaluationMetadataType.LlmAsJudgeAdvanced,
          prompt: val,
        },
      })
    },
    [update, evaluation],
  )

  const onChange = useCallback(
    (value: string) => {
      setValue(value)
      runReadMetadata({
        prompt: value,
        withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
      })
    },
    [setValue, runReadMetadata, providers],
  )

  if (!evaluation) return null

  return (
    <>
      <EditorHeader
        freeRunsCount={freeRunsCount}
        providers={providers}
        title='Evaluation editor'
        metadata={metadata}
        prompt={value}
        onChangePrompt={onChange}
        rightActions={
          <>
            {value !== evaluationMetadata.prompt && (
              <Button
                fancy
                disabled={isUpdating || isLoading}
                onClick={() => save(value)}
              >
                Save changes
              </Button>
            )}
          </>
        }
      />
      <Suspense fallback={<DocumentTextEditorFallback />}>
        <DocumentTextEditor
          value={value}
          metadata={metadata}
          onChange={onChange}
        />
      </Suspense>
    </>
  )
}
