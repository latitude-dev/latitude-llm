'use client'

import { useState } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import type { ConversationMetadata } from '@latitude-data/promptl'
import { SplitPane, useCurrentCommit } from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import Chat from './Chat'
import { DocumentParams } from './DocumentParams'
import Preview from './Preview'

const COLLAPSED_SIZE = 56 // Closed parameters
const GAP_PADDING = 16

export default function Playground({
  document,
  metadata,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const [expanded, setExpanded] = useState(true)
  const { parameters } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    documentVersionUuid: document.documentUuid,
  })
  const [forcedSize, setForcedSize] = useState<number | undefined>()
  return (
    <SplitPane
      direction='vertical'
      gap={4}
      initialPercentage={25}
      forcedSize={forcedSize}
      minSize={COLLAPSED_SIZE + GAP_PADDING}
      dragDisabled={!expanded}
      firstPane={
        <DocumentParams
          commitVersionUuid={commit.uuid}
          document={document}
          onExpand={(expand) => {
            setForcedSize(expand ? undefined : COLLAPSED_SIZE)
            setExpanded(expand)
          }}
        />
      }
      secondPane={
        <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden'>
          {mode === 'preview' ? (
            <Preview
              metadata={metadata}
              parameters={parameters}
              runPrompt={() => setMode('chat')}
            />
          ) : (
            <Chat
              clearChat={() => setMode('preview')}
              document={document}
              parameters={parameters}
            />
          )}
        </div>
      }
    />
  )
}
