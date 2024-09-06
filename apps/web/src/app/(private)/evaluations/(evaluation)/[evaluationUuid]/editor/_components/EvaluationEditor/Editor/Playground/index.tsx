'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { capitalize } from 'lodash-es'

import {
  ConversationMetadata,
  Message,
  MessageContent,
  TextContent,
} from '@latitude-data/compiler'
import { EvaluationDto } from '@latitude-data/core/browser'
import { Badge, Icon, Text, TextArea } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useProviderLogs from '$/stores/providerLogs'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Header } from '../Header'
import Chat, { EVALUATION_PARAMETERS, Inputs } from './Chat'
import Preview from './Preview'

function convertMessage(message: Message) {
  if (typeof message.content === 'string') {
    return `${capitalize(message.role)}: \n ${message.content}`
  } else {
    const content = message.content[0] as MessageContent
    if (content.type === 'text') {
      return `${capitalize(message.role)}: \n ${(content as TextContent).text}`
    } else {
      return `${capitalize(message.role)}: <${content.type} message>`
    }
  }
}

function convertMessages(messages: Message[]) {
  return messages.map((message) => convertMessage(message)).join('\n')
}

function convertParams(inputs: Inputs) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
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
  const [inputs, setInputs] = useState<Inputs>(
    Object.fromEntries(
      EVALUATION_PARAMETERS.map((param: string) => [param, '']),
    ),
  )
  const parameters = useMemo(() => convertParams(inputs), [inputs])
  const searchParams = useSearchParams()
  const providerLogUuid = searchParams.get('providerLogUuid')
  const { data } = useProviderLogs()
  const providerLog = useMemo(
    () => data?.find((log) => log.uuid === providerLogUuid),
    [data, providerLogUuid],
  )

  const setInput = useCallback((param: string, value: string) => {
    setInputs((inputs) => ({ ...inputs, [param]: value }))
  }, [])

  useEffect(() => {
    if (providerLog) {
      setInputs({
        messages: convertMessages(providerLog.messages),
        last_message: `Assistant: ${providerLog.responseText}`,
      })
    }
  }, [setInput, providerLog])

  return (
    <>
      <Header title='Playground' />
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
              <Text.H5M>Import data from logs</Text.H5M>{' '}
              <Icon name='addSquare' />
            </Link>
          </div>
          {Object.keys(inputs).length > 0 ? (
            Object.entries(inputs).map(([param, value], idx) => (
              <div
                className='flex flex-row gap-4 w-full items-center'
                key={idx}
              >
                <Badge variant='accent'>&#123;&#123;{param}&#125;&#125;</Badge>
                <div className='flex flex-grow w-full'>
                  <TextArea
                    value={value}
                    onChange={(e) => setInput(param, e.currentTarget.value)}
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
                  evaluation={evaluation}
                  parameters={parameters}
                  clearChat={() => setMode('preview')}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
