'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'

import {
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataType,
  ProviderApiKey,
  SERIALIZED_DOCUMENT_LOG_FIELDS,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { EditorHeader } from '$/components/EditorHeader'
import { useMetadata } from '$/hooks/useMetadata'
import useEvaluations from '$/stores/evaluations'
import useProviderApiKeys from '$/stores/providerApiKeys'

import { UpdateToPromptLButton } from './UpdateToPromptl'

type AdvancedEvaluationDto = EvaluationDto & {
  metadata: EvaluationMetadataLlmAsJudgeAdvanced
}

export default function AdvancedEvaluationEditor({
  evaluation: serverEvaluation,
  defaultPrompt,
  providerApiKeys,
  freeRunsCount,
}: {
  evaluation: AdvancedEvaluationDto
  defaultPrompt: string
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
}) {
  const { findEvaluation, isLoading, update, isUpdating } = useEvaluations({
    fallbackData: [serverEvaluation],
  })
  const evaluation = findEvaluation(
    serverEvaluation.uuid,
  ) as AdvancedEvaluationDto
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const [value, setValue] = useState(defaultPrompt)
  const { metadata, runReadMetadata } = useMetadata()

  const [promptlVersion, setPromptlVersion] = useState(
    evaluation.metadata.promptlVersion,
  )
  useEffect(() => {
    setPromptlVersion(evaluation.metadata.promptlVersion)
  }, [evaluation.metadata.promptlVersion])

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
      promptlVersion,
    })
  }, [providers, runReadMetadata, evaluation?.metadata, promptlVersion])

  const save = useCallback(
    (val: string) => {
      update({
        id: evaluation!.id,
        metadata: {
          type: EvaluationMetadataType.LlmAsJudgeAdvanced,
          prompt: val,
          promptlVersion,
        },
      })
    },
    [update, evaluation, promptlVersion],
  )

  const onChange = useCallback(
    (value: string) => {
      setValue(value)
      runReadMetadata({
        prompt: value,
        withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
        promptlVersion,
      })
    },
    [
      setValue,
      runReadMetadata,
      providers,
      evaluation?.metadata,
      promptlVersion,
    ],
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
            {promptlVersion === 0 && (
              <UpdateToPromptLButton
                evaluation={evaluation}
                setPromptlVersion={setPromptlVersion}
              />
            )}
            {(value !== evaluation.metadata.prompt ||
              promptlVersion !== evaluation.metadata.promptlVersion) && (
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
      <Suspense fallback={<TextEditorPlaceholder />}>
        <DocumentTextEditor
          value={value}
          compileErrors={metadata?.errors}
          onChange={onChange}
        />
      </Suspense>
    </>
  )
}
