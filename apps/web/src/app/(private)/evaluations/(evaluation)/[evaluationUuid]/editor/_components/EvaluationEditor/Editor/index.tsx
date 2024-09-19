'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'

import { promptConfigSchema } from '@latitude-data/core/browser'
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
import { EVALUATION_PARAMETERS } from './Playground/Chat'

export default function EvaluationEditor({
  evaluationUuid,
  defaultPrompt,
}: {
  evaluationUuid: string
  defaultPrompt: string
}) {
  const { data, isLoading, update, isUpdating } = useEvaluations()
  const evaluation = useMemo(
    () => data.find((e) => e.uuid === evaluationUuid),
    [evaluationUuid, data],
  )
  const { data: providers } = useProviderApiKeys()
  const [value, setValue] = useState(defaultPrompt)
  const configSchema = useMemo(
    () => promptConfigSchema({ providers: providers ?? [] }),
    [providers],
  )
  const { metadata } = useMetadata({
    prompt: value,
    withParameters: EVALUATION_PARAMETERS,
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
      <div className='flex flex-col flex-1 gap-2'>
        <Playground evaluation={evaluation} metadata={metadata!} />
      </div>
    </div>
  )
}
