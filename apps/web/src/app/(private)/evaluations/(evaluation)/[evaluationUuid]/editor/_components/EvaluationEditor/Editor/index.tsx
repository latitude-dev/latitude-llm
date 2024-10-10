'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'

import {
  promptConfigSchema,
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

import Playground from './Playground'

export default function EvaluationEditor({
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
  const { data, isLoading, update, isUpdating } = useEvaluations()
  const evaluation = useMemo(
    () => data.find((e) => e.uuid === evaluationUuid),
    [evaluationUuid, data],
  )
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const [value, setValue] = useState(defaultPrompt)
  const configSchema = useMemo(
    () => promptConfigSchema({ providers: providers ?? [] }),
    [providers],
  )
  const { metadata } = useMetadata({
    prompt: value,
    withParameters: SERIALIZED_DOCUMENT_LOG_FIELDS,
    configSchema,
  })

  const save = useCallback(
    (val: string) => {
      update({
        id: evaluation!.id,
        metadata: { prompt: val },
      })
    },
    [update, evaluation],
  )

  const onChange = useCallback(
    (value: string) => {
      setValue(value)
    },
    [setValue],
  )

  if (!evaluation) return null

  return (
    <div className='flex flex-row w-full h-full gap-8'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <EditorHeader
          freeRunsCount={freeRunsCount}
          providers={providers}
          title='Evaluation editor'
          metadata={metadata}
          prompt={value}
          onChangePrompt={onChange}
          rightActions={
            <>
              {value !== evaluation.metadata.prompt && (
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
      </div>
      <div className='flex flex-col flex-1 gap-2 min-w-0 max-w-1/2 overflow-y-auto max-h-[calc(100vh-150px)]'>
        <Playground evaluation={evaluation} metadata={metadata!} />
      </div>
    </div>
  )
}
