'use client'

import { useCallback, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  PlaygroundInput,
  useDocumentParameters as useDocumentParametersOld,
} from '$/hooks/useDocumentParameters/oldHook'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

import { Header } from '../Header'
import Chat from './Chat'
import { DocumentParams } from './DocumentParams'
import { OldInputs } from './OldInputs'
import Preview from './Preview'

// FIXME: Remove oldParameters when we remove feature flag
function useOldParameters({
  commitUuid,
  document,
}: {
  commitUuid: string
  document: DocumentVersion
}) {
  const {
    parameters: oldParameters,
    inputs: oldInputs,
    setInputs,
  } = useDocumentParametersOld({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid: commitUuid,
  })
  const setOldInput = useCallback(
    (param: string, value: PlaygroundInput) => {
      setInputs({ ...oldInputs, [param]: value })
    },
    [oldInputs, setInputs],
  )
  return { setOldInput, oldParameters, oldInputs }
}

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
  const { oldParameters, oldInputs, setOldInput } = useOldParameters({
    commitUuid: commit.uuid,
    document,
  })
  const { parameters: newParameters } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    documentVersionUuid: document.documentUuid,
  })

  // FIXME: Remove oldParameters when we remove feature flag
  const parameters = newParams ? newParameters : oldParameters

  return (
    <div className='flex flex-col gap-2 max-h-full h-full'>
      <Header title='Parameters' />
      {newParams ? (
        <div className='max-h-[33%] flex flex-col'>
          <DocumentParams commitVersionUuid={commit.uuid} document={document} />
        </div>
      ) : (
        <div className='flex flex-col flex-shrink-0 pb-1 pr-1 max-h-[33%] custom-scrollbar'>
          <OldInputs inputs={oldInputs} setInput={setOldInput} />
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
