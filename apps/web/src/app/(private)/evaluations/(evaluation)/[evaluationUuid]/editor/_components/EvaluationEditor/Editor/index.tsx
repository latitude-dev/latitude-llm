'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import {
  AppLocalStorage,
  Button,
  DocumentTextEditor,
  DocumentTextEditorFallback,
  DropdownMenu,
  useLocalStorage,
} from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluations'

import { Header } from './Header'
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
  const [value, setValue] = useState(defaultPrompt)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const { value: showLineNumbers, setValue: setShowLineNumbers } =
    useLocalStorage({
      key: AppLocalStorage.editorLineNumbers,
      defaultValue: true,
    })
  const { value: wrapText, setValue: setWrapText } = useLocalStorage({
    key: AppLocalStorage.editorWrapText,
    defaultValue: true,
  })
  const { value: showMinimap, setValue: setShowMinimap } = useLocalStorage({
    key: AppLocalStorage.editorMinimap,
    defaultValue: false,
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

  useEffect(() => {
    readMetadata({
      prompt: value,
      withParameters: EVALUATION_PARAMETERS,
    }).then(setMetadata)
  }, [value])

  if (!evaluation) return null

  return (
    <div className='flex flex-row w-full h-full gap-8 p-6'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <Header title='Evaluation editor'>
          {value !== evaluation.metadata.prompt && (
            <Button
              fancy
              disabled={isUpdating || isLoading}
              onClick={() => save(value)}
            >
              Save changes
            </Button>
          )}
          <DropdownMenu
            options={[
              {
                label: 'Show line numbers',
                onClick: () => setShowLineNumbers(!showLineNumbers),
                checked: showLineNumbers,
              },
              {
                label: 'Wrap text',
                onClick: () => setWrapText(!wrapText),
                checked: wrapText,
              },
              {
                label: 'Show minimap',
                onClick: () => setShowMinimap(!showMinimap),
                checked: showMinimap,
              },
            ]}
            side='bottom'
            align='end'
          />
        </Header>
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
