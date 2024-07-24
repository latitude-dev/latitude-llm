'use client'

import {
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { Badge, Input, Text } from '$ui/ds/atoms'
import {
  DocumentTextEditor,
  DocumentTextEditorFallback,
} from '$ui/ds/molecules'
import { useCurrentCommit } from '$ui/providers'
import { useDebouncedCallback } from 'use-debounce'

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className='flex flex-row h-8 space-between items-center'>
      <Text.H5M>{title}</Text.H5M>
      {children}
    </div>
  )
}

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
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const { commit } = useCurrentCommit()

  const debouncedSave = useDebouncedCallback(saveDocumentContent, 2_000)

  const onChange = useCallback((value: string) => {
    setValue(value)
    debouncedSave(value)
  }, [])

  useEffect(() => {
    readMetadata({
      prompt: value,
      referenceFn: readDocument,
    }).then(setMetadata)
  }, [value, readDocument])

  const inputs = useMemo(() => {
    if (!metadata) return []
    return Array.from(metadata.parameters)
  }, [metadata])

  return (
    <div className='flex flex-row w-full h-full gap-8 p-6'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <Header title='Prompt editor' />
        <Suspense fallback={<DocumentTextEditorFallback />}>
          <DocumentTextEditor
            value={value}
            metadata={metadata}
            onChange={onChange}
            readOnlyMessage={
              commit.mergedAt ? 'Create a draft to edit documents' : undefined
            }
          />
        </Suspense>
      </div>
      <div className='flex flex-col flex-1'>
        <Header title='Playground' />
        <div className='flex flex-col gap-6'>
          <div className='flex flex-col gap-3'>
            <Text.H6M>Inputs</Text.H6M>
            {inputs.length > 0 ? (
              inputs.map((param) => (
                <div className='flex flex-row gap-4 w-full items-center'>
                  <Badge variant='accent'>
                    &#123;&#123;{param}&#125;&#125;
                  </Badge>
                  <Input />
                </div>
              ))
            ) : (
              <Text.H6 color='foregroundMuted'>
                No inputs. Use &#123;&#123; input_name &#125;&#125; to insert.
              </Text.H6>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
