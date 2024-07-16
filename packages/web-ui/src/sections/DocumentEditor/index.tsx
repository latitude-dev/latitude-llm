'use client'

import { ReactNode, Suspense, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { Input, Text } from '$ui/ds/atoms'
import {
  DocumentTextEditor,
  DocumentTextEditorFallback,
} from '$ui/ds/molecules'
import { useCurrentCommit } from '$ui/providers/CommitProvider'

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className='flex flex-row h-8 space-between items-center'>
      <Text.H5M>{title}</Text.H5M>
      {children}
    </div>
  )
}

export function DocumentEditor({ content }: { content: string }) {
  const { isDraft } = useCurrentCommit()
  const [value, setValue] = useState(content)
  const [metadata, setMetadata] = useState<ConversationMetadata>()
  useEffect(() => {
    readMetadata({ prompt: value }).then(setMetadata)
  }, [value])
  const inputs = useMemo(() => {
    if (!metadata) return []
    return Array.from(metadata.parameters)
  }, [metadata])

  return (
    <div className='flex flex-row w-full h-full gap-8'>
      <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
        <Header title='Prompt editor' />
        <Suspense fallback={<DocumentTextEditorFallback />}>
          <DocumentTextEditor
            value={value}
            metadata={metadata}
            onChange={setValue}
            disabled={!isDraft}
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
                  <div className='flex py-0.5 px-1.5 bg-accent rounded-md'>
                    <Text.H6M color='accentForeground'>
                      &#123;&#123;{param}&#125;&#125;
                    </Text.H6M>
                  </div>
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
