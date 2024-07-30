'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { DropdownMenu } from '$ui/ds/atoms/DropdownMenu'
import {
  DocumentTextEditor,
  DocumentTextEditorFallback,
} from '$ui/ds/molecules'
import { AppLocalStorage, useLocalStorage } from '$ui/lib/hooks/useLocalStorage'
import { useCurrentCommit } from '$ui/providers'
import { useDebouncedCallback } from 'use-debounce'

import { Header } from './Header'
import Playground from './Playground'

export default function DocumentEditor({
  document,
  saveDocumentContent,
  readDocument,
}: {
  document: string
  saveDocumentContent: (content: string) => void
  readDocument?: (uuid: string) => Promise<string>
}) {
  const [value, setValue] = useState(document)
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

  const { commit } = useCurrentCommit()

  const debouncedSave = useDebouncedCallback((val: string) => {
    saveDocumentContent(val)
    setIsSaved(true)
  }, 2_000)

  const onChange = useCallback((value: string) => {
    setIsSaved(false)
    setValue(value)
    debouncedSave(value)
  }, [])

  useEffect(() => {
    readMetadata({
      prompt: value,
      referenceFn: readDocument,
    }).then(setMetadata)
  }, [value, readDocument])

  return (
    <div className='flex flex-row w-full h-full gap-8 p-6'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <Header title='Prompt editor'>
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
            readOnlyMessage={
              commit.mergedAt ? 'Create a draft to edit documents' : undefined
            }
            isSaved={isSaved}
          />
        </Suspense>
      </div>
      <div className='flex flex-col flex-1 gap-2'>
        <Playground metadata={metadata} />
      </div>
    </div>
  )
}
