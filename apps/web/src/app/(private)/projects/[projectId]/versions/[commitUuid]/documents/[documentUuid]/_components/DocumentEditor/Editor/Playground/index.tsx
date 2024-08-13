'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { Badge, Button, Input, Text } from '@latitude-data/web-ui'

import { Header } from '../Header'
import Chat from './Chat'
import Preview from './Preview'

function convertParams(
  inputs: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      try {
        value = JSON.parse(value)
      } catch (e) {
        // Do nothing
      }
      return [key, value]
    }),
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

  const setInput = useCallback(
    (param: string, value: string) => {
      setInputs({ ...inputs, [param]: value })
    },
    [inputs],
  )

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
    <>
      <Header title='Playground'>
        {mode === 'chat' && (
          <Button fancy onClick={() => setMode('preview')} variant='outline'>
            Clear chat
          </Button>
        )}
      </Header>
      <div className='flex flex-col gap-6 h-full relative'>
        <div className='flex flex-col gap-3'>
          <Text.H6M>Inputs</Text.H6M>
          {Object.keys(inputs).length > 0 ? (
            Object.entries(inputs).map(([param, value]) => (
              <div className='flex flex-row gap-4 w-full items-center'>
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
        <div className='flex flex-col gap-3 h-full'>
          <div className='flex flex-col flex-grow flex-shrink relative h-full overflow-y-auto'>
            <div className='absolute top-0 left-0 right-0 bottom-0'>
              {mode === 'preview' ? (
                <Preview
                  metadata={metadata}
                  parameters={parameters}
                  runPrompt={() => setMode('chat')}
                />
              ) : (
                <Chat
                  document={document}
                  parameters={parameters}
                  metadata={metadata!}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}