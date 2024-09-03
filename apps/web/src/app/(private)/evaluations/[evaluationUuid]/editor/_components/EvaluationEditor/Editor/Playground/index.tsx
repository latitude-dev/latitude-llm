'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { EvaluationDto } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  Icons,
  Input,
  Text,
  TextArea,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useProviderLogs from '$/stores/providerLogs'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Header } from '../Header'
import Preview from './Preview'

type InputDto = {
  value: string
  type: 'textarea' | 'input'
}

function convertParams(inputs: Record<string, InputDto>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, inputDto]) => {
      let value
      try {
        value = JSON.parse(inputDto.value)
      } catch (e) {
        // Do nothing
      }
      return [key, value]
    }),
  )
}

export default function Playground({
  evaluation,
  metadata,
}: {
  evaluation: EvaluationDto
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const [inputs, setInputs] = useState<Record<string, InputDto>>({})
  const parameters = useMemo(() => convertParams(inputs), [inputs])
  const searchParams = useSearchParams()
  const providerLogUuid = searchParams.get('providerLogUuid')
  const { data } = useProviderLogs()
  const providerLog = useMemo(
    () => data?.find((log) => log.uuid === providerLogUuid),
    [data, providerLogUuid],
  )

  const setInput = useCallback((param: string, value: InputDto) => {
    setInputs((inputs) => ({ ...inputs, [param]: value }))
  }, [])

  useEffect(() => {
    if (providerLog) {
      setInput('messages', {
        type: 'textarea',
        value: JSON.stringify(providerLog.messages),
      })
    }
  }, [setInput, providerLog])

  useEffect(() => {
    if (!metadata) return

    // Remove only inputs that are no longer in the metadata, and add new ones
    // Leave existing inputs as they are
    setInputs(
      Object.fromEntries(
        Array.from(metadata.parameters).map((param) => {
          if (param in inputs) return [param, inputs[param]!]

          return [param, { value: '', type: 'input' }]
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
          <div className='flex flex-row items-center justify-between gap-4'>
            <Text.H6M>Variables</Text.H6M>
            <Link
              className='flex flex-row gap-2 items-center'
              href={
                ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor
                  .importLogs.root
              }
            >
              <Text.H5M>Import data from logs</Text.H5M> <Icons.addSquare />
            </Link>
          </div>
          {Object.keys(inputs).length > 0 ? (
            Object.entries(inputs).map(([param, inputDto], idx) => (
              <div
                className='flex flex-row gap-4 w-full items-center'
                key={idx}
              >
                <Badge variant='accent'>&#123;&#123;{param}&#125;&#125;</Badge>
                <div className='flex flex-grow w-full'>
                  {inputDto.type === 'textarea' ? (
                    <TextArea
                      value={inputDto.value}
                      onChange={(e) =>
                        setInput(param, {
                          ...inputDto,
                          value: e.currentTarget.value,
                        })
                      }
                    />
                  ) : (
                    <Input
                      value={inputDto.value}
                      onChange={(e) =>
                        setInput(param, {
                          ...inputDto,
                          value: e.currentTarget.value,
                        })
                      }
                    />
                  )}
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
              {
                mode === 'preview' ? (
                  <Preview
                    metadata={metadata}
                    parameters={parameters}
                    runPrompt={() => setMode('chat')}
                  />
                ) : null // TODO: Implement Chat component
              }
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
