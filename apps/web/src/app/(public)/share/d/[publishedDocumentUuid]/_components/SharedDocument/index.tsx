'use client'

import { capitalize } from 'lodash-es'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { ParameterType, PublishedDocument } from '@latitude-data/core/browser'
import { Button, Card, CardContent, cn, FormField } from '@latitude-data/web-ui'
import { ConversationMetadata } from 'promptl-ai'

import { ParameterInput } from '$/components/ParameterInput'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { Container } from '../Container'
import { PromptHeader } from '../Header'
import { Messages } from '../Messages'
import { useChat } from './useChat'
import { usePrompt } from './usePrompt'

const ParameterTypes = Object.values(ParameterType) as string[]

// Sync with the CSS transition duration
const DURATION_CLASS = 'duration-100 ease-in-out'
const DURATION_MS_RUN = 100
const DURATION_MS_RESET = 100
const CARD_Y_PADDING = 24 // 12px padding top and bottom

function convertParametersToUrlSearchParams(
  parameters: Record<string, string>,
) {
  const clean = Object.entries(parameters).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const cleanValue = value.trim()
      if (cleanValue.length > 0) {
        acc[encodeURIComponent(key)] = encodeURIComponent(cleanValue)
      }
      return acc
    },
    {},
  )
  return new URLSearchParams(clean).toString()
}

type Parameters = Record<
  string,
  {
    label: string
    type: ParameterType
    value: string
  }
>
function useParameters({
  metadata,
  queryParams,
}: {
  metadata: ServerClientMetadata
  queryParams: Record<string, string>
}) {
  return useState(
    Array.from(metadata.parameters).reduce<Parameters>((acc, parameter) => {
      let type = (metadata.config.parameters || {})[parameter]?.type
      if (!type || !ParameterTypes.includes(type)) type = ParameterType.Text

      acc[parameter] = {
        label: parameter.split('_').map(capitalize).join(' '),
        type: type as ParameterType,
        value: queryParams[parameter] ?? '',
      }

      return acc
    }, {}),
  )
}

type ServerClientMetadata = Omit<ConversationMetadata, 'setConfig'> & {
  config: { parameters?: Record<string, { type?: string }> }
}
function PromptForm({
  metadata,
  onSubmit,
  queryParams,
}: {
  metadata: ServerClientMetadata
  onSubmit: (parameters: Record<string, string>) => void
  queryParams: Record<string, string>
}) {
  const [parameters, setParameters] = useParameters({ metadata, queryParams })

  const onFormSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSubmit(
        Object.entries(parameters).reduce(
          (acc, [parameter, { value }]) => ({ ...acc, [parameter]: value }),
          {},
        ),
      )
    },
    [onSubmit, parameters],
  )

  return (
    <form className='h-full flex flex-col gap-y-4' onSubmit={onFormSubmit}>
      {Object.entries(parameters).map(([name, parameter]) => {
        return (
          <FormField key={name} label={parameter.label}>
            <ParameterInput
              type={parameter.type}
              value={parameter.value}
              onChange={(value) => {
                setParameters({
                  ...parameters,
                  [name]: { ...parameter, value },
                })
              }}
            />
          </FormField>
        )
      })}
      <Button fancy fullWidth type='submit' variant='default'>
        Run prompt
      </Button>
    </form>
  )
}

function useSearchParams({ shared }: { shared: PublishedDocument }) {
  const router = useNavigate()
  const promptPath = ROUTES.share.document(shared.uuid!).root
  return useCallback(
    (parameters: Record<string, string>) => {
      const search = convertParametersToUrlSearchParams(parameters)
      router.replace(`${promptPath}?${search}`)
    },
    [router, promptPath],
  )
}

export function SharedDocument({
  metadata,
  shared,
  queryParams,
}: {
  metadata: ServerClientMetadata
  shared: PublishedDocument
  queryParams: Record<string, string>
}) {
  const updateSearchParams = useSearchParams({ shared })
  const formRef = useRef<HTMLDivElement>(null)
  const originalFormHeight = useRef<number | undefined>(undefined)
  const originalFormWidth = useRef<number | undefined>(undefined)
  const [formHeight, setFormHeight] = useState<number | undefined>(undefined)
  const [isFormVisible, setFormVisible] = useState(true)
  const [isChatVisible, setChatVisible] = useState(false)
  const prompt = usePrompt({ shared })
  const onSubmit = useCallback(
    async (parameters: Record<string, string>) => {
      setFormVisible(false)
      setFormHeight(undefined)
      updateSearchParams(parameters)

      // Give time to animation to finish
      setTimeout(async () => {
        setChatVisible(true)
        await prompt.runPrompt(parameters)
      }, DURATION_MS_RUN)
    },
    [prompt.runPrompt],
  )
  const onReset = useCallback(() => {
    setFormHeight(originalFormHeight.current)
    setChatVisible(false)
    setTimeout(() => {
      setFormVisible(true)
      prompt.resetPrompt()
    }, DURATION_MS_RESET)
  }, [prompt.resetPrompt])

  const { onChat } = useChat({
    shared,
    documentLogUuid: prompt.documentLogUuid,
    addMessageToConversation: prompt.addMessageToConversation,
    setResponseStream: prompt.setResponseStream,
    setError: prompt.setError,
  })

  useEffect(() => {
    if (!formRef.current) return
    if (originalFormHeight.current !== undefined) return

    const form = formRef.current as HTMLDivElement
    const height = form.clientHeight
    originalFormHeight.current = height
    originalFormWidth.current = form.clientWidth
    setFormHeight(height)
  }, [formHeight])
  return (
    <div className='h-screen bg-background-gray flex flex-col pb-4 sm:pb-8 gap-y-4 sm:gap-y-8 custom-scrollbar'>
      <PromptHeader shared={shared} />
      <Container
        className={cn('flex justify-center', {
          'flex-grow min-h-0': !isFormVisible,
        })}
      >
        <Card
          shadow='sm'
          background='light'
          className={cn('transition-all ', {
            'w-full': isChatVisible,
            'w-full sm:w-modal': isFormVisible,
          })}
          style={{
            minWidth: originalFormWidth.current,
            minHeight: formHeight ? formHeight + CARD_Y_PADDING : undefined,
          }}
        >
          <CardContent standalone spacing='small' className='h-full'>
            <div
              className={cn(
                'relative flex flex-col justify-center gap-y-4',
                'transition-all',
                {
                  'h-full': originalFormHeight.current !== undefined,
                },
              )}
            >
              <div
                ref={formRef}
                className={cn(
                  'transform transition-transform',
                  DURATION_CLASS,
                  {
                    'absolute inset-0 translate-y-0': !isFormVisible,
                    '-translate-y-full': !isFormVisible,
                  },
                )}
              >
                <PromptForm
                  metadata={metadata}
                  onSubmit={onSubmit}
                  queryParams={queryParams}
                />
              </div>
              <div
                className={cn(
                  'absolute inset-0 transform transition-all',
                  DURATION_CLASS,
                  {
                    'translate-y-0 opacity-100': isChatVisible,
                    'pointer-events-none opacity-0': !isChatVisible,
                  },
                )}
              >
                {isChatVisible ? (
                  <Messages
                    isStreaming={prompt.isStreaming}
                    isLoadingPrompt={prompt.isLoadingPrompt}
                    responseStream={prompt.responseStream}
                    conversation={prompt.conversation}
                    chainLength={prompt.chainLength}
                    error={prompt.error}
                    onChat={onChat}
                    onReset={onReset}
                    canChat={shared.canFollowConversation}
                    lastMessage={prompt.lastMessage}
                  />
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}
