'use client'

import { useCallback, useEffect, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { Badge, Text, TextArea, useCurrentCommit } from '@latitude-data/web-ui'
import {
  PlaygroundInputs,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'

import { Header } from '../Header'
import Chat from './Chat'
import Preview from './Preview'

function InputParams({
  inputs,
  setInputs,
}: {
  inputs: PlaygroundInputs
  setInputs: (inputs: PlaygroundInputs) => void
}) {
  const [ssr, setSsr] = useState(true)
  const setInput = useCallback(
    (param: string, value: string) => {
      setInputs({ ...inputs, [param]: value })
    },
    [inputs, setInputs],
  )
  useEffect(() => {
    setSsr(false)
  }, [])

  // Avoid rendering inputs on server
  // We have a Hydration issue with the inputs because
  // they come from localStorage and are not available on the server
  if (ssr) return null

  return (
    <div className='flex flex-col gap-3 flex-shrink-0 pb-1 pr-1 max-h-[33%] custom-scrollbar'>
      <Text.H6M>Inputs</Text.H6M>
      {Object.keys(inputs).length > 0 ? (
        Object.entries(inputs).map(([param, value], idx) => (
          <div className='flex flex-row gap-4 w-full items-center' key={idx}>
            <Badge variant='accent'>&#123;&#123;{param}&#125;&#125;</Badge>
            <div className='flex flex-grow w-full'>
              <TextArea
                value={value}
                onChange={(e) => setInput(param, e.target.value)}
                minRows={1}
              />
            </div>
          </div>
        ))
      ) : (
        <Text.H6 color='foregroundMuted'>
          No inputs. Use &#123;&#123; input_name &#125;&#125; to insert.
        </Text.H6>
      )}
    </div>
  )
}

export default function Playground({
  document,
  metadata,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const { commit } = useCurrentCommit()
  const { parameters, inputs, setInputs } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid: commit.uuid,
  })
  return (
    <div className='flex flex-col gap-2 max-h-full h-full'>
      <Header title='Playground' />
      <InputParams inputs={inputs} setInputs={setInputs} />
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
