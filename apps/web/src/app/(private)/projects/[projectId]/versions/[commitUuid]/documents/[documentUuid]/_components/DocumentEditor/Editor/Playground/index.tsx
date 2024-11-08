'use client'

import { useCallback, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui'
import {
  PlaygroundInput,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

import { Header } from '../Header'
import Chat from './Chat'
import { DocumentParams } from './DocumentParams'
import { InputParams } from './DocumentParams/Input'
import Preview from './Preview'

export default function Playground({
  document,
  metadata,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata
}) {
  const newParams = useFeatureFlag()
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const { parameters, inputs, setInputs } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid: commit.uuid,
  })
  const setInput = useCallback(
    (param: string, value: PlaygroundInput) => {
      setInputs({ ...inputs, [param]: value })
    },
    [inputs, setInputs],
  )

  return (
    <div className='flex flex-col gap-2 max-h-full h-full'>
      <Header title='Playground' />
      {newParams ? (
        <div className='max-h-[33%] flex flex-col'>
          <DocumentParams
            inputs={inputs}
            setInput={setInput}
            setInputs={setInputs}
          />
        </div>
      ) : (
        <div className='flex flex-col flex-shrink-0 pb-1 pr-1 max-h-[33%] custom-scrollbar'>
          <InputParams showTitle inputs={inputs} setInput={setInput} />
        </div>
      )}
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
