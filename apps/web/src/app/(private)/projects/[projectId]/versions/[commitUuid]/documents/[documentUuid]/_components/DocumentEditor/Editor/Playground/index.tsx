'use client'

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { Badge, Input, Text } from '@latitude-data/web-ui'

import { Header } from '../Header'
import Chat from './Chat'
import Preview from './Preview'

export function convertParams(inputs: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      try {
        return [key, JSON.parse(value)]
      } catch (e) {
        return [key, value]
      }
    }),
  )
}

function InputParams({
  inputs,
  setInputs,
}: {
  inputs: Record<string, string>
  setInputs: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const setInput = useCallback(
    (param: string, value: string) => {
      setInputs({ ...inputs, [param]: value })
    },
    [inputs],
  )

  return (
    <div className='flex flex-col gap-3 flex-shrink-0 max-h-[33%] custom-scrollbar'>
      <Text.H6M>Inputs</Text.H6M>
      {Object.keys(inputs).length > 0 ? (
        Object.entries(inputs).map(([param, value], idx) => (
          <div className='flex flex-row gap-4 w-full items-center' key={idx}>
            <Badge variant='accent'>&#123;&#123;{param}&#125;&#125;</Badge>
            <div className='flex flex-grow w-full'>
              <Input
                value={value}
                onChange={(e) => setInput(param, e.target.value)}
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
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const parameters = useMemo(() => convertParams(inputs), [inputs])

  useEffect(() => {
    if (!metadata) return

    // Remove only inputs that are no longer in the metadata, and add new ones
    // Leave existing inputs as they are
    setInputs(
      Object.fromEntries(
        Array.from(metadata.parameters).map((param) => {
          if (param in inputs) return [param, inputs[param]!]
          return [param, '']
        }),
      ),
    )
  }, [metadata])

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
