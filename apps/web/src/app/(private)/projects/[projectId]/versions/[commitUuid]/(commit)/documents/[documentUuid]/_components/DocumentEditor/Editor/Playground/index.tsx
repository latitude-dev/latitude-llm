'use client'

import { useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import Chat from './Chat'
import { DocumentParams } from './DocumentParams'
import Preview from './Preview'

export default function Playground({
  document,
  metadata,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const { parameters } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    documentVersionUuid: document.documentUuid,
  })

  return (
    <div className='flex flex-col gap-2 max-h-full h-full'>
      <div className='max-h-[33%] flex flex-col'>
        <DocumentParams commitVersionUuid={commit.uuid} document={document} />
      </div>
      <div className='flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden'>
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
    </div>
  )
}
