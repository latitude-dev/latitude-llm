'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { EvaluationDto } from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  DocumentTextEditor,
  DocumentTextEditorFallback,
  DropdownMenu,
  useLocalStorage,
} from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluationsStore'
import { useDebouncedCallback } from 'use-debounce'

import { Header } from './Header'
import Playground from './Playground'

export default function EvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { updateEvaluation } = useEvaluations()
  const [value, setValue] = useState(evaluation.metadata.prompt)
  const [isSaved, setIsSaved] = useState(true)
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

  const debouncedSave = useDebouncedCallback(
    (val: string) => {
      updateEvaluation({
        id: evaluation.id,
        metadata: { prompt: val },
      })
      setIsSaved(true)
    },
    500,
    { trailing: true },
  )

  const onChange = useCallback((value: string) => {
    setIsSaved(false)
    setValue(value)
    debouncedSave(value)
  }, [])

  useEffect(() => {
    readMetadata({
      prompt: value,
      // withParameters: ['messages', 'response'], // TODO: uncomment this line once I understand why it breaks
    }).then(setMetadata)
  }, [value])

  return (
    <div className='flex flex-row w-full h-full gap-8 p-6'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <Header title='Evaluation editor'>
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
            isSaved={isSaved}
          />
        </Suspense>
      </div>
      <div className='flex flex-col flex-1 gap-2'>
        <Playground evaluation={evaluation} metadata={metadata!} />
      </div>
    </div>
  )
}
