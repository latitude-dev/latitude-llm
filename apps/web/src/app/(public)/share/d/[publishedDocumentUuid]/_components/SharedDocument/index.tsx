'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { capitalize } from 'lodash-es'

import { PublishedDocument } from '@latitude-data/core/browser'
import { ConversationMetadata } from '@latitude-data/promptl'
import { Button, Card, CardContent, cn, TextArea } from '@latitude-data/web-ui'

import { Container } from '../Container'
import { PromptHeader } from '../Header'
import { Messages } from '../Messages'
import { usePrompt } from './usePrompt'
import { useChat } from './useChat'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

// Sync with the CSS transition duration
const DURATION_CLASS = 'duration-100 ease-in-out'
const DURATION_MS_RUN = 100
const DURATION_MS_RESET = 100
const CARD_Y_PADDING = 24 // 12px padding top and bottom

function convertFormDataToParameters(formData: FormData) {
  const entries = Array.from(formData.entries())
  return entries.reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value.toString()
    return acc
  }, {})
}

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

function useParameters({
  parameters,
  queryParams,
}: {
  parameters: Set<string>
  queryParams: Record<string, string>
}) {
  return useRef(
    Array.from(parameters).map((parameter) => {
      const value = queryParams[parameter] ?? ''
      return {
        name: parameter,
        label: capitalize(parameter),
        value,
      }
    }),
  ).current
}

type ServerClientMetadata = Omit<ConversationMetadata, 'setConfig'>
function PromptForm({
  metadata,
  onSubmit,
  queryParams,
}: {
  metadata: ServerClientMetadata
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  queryParams: Record<string, string>
}) {
  const parameters = useParameters({
    parameters: metadata.parameters,
    queryParams,
  })
  return (
    <form className='h-full flex flex-col gap-y-4' onSubmit={onSubmit}>
      {parameters.map((parameter, index) => {
        return (
          <TextArea
            minRows={1}
            maxRows={6}
            key={`${parameter.name}-${index}`}
            name={parameter.name}
            label={parameter.label}
            defaultValue={parameter.value}
          />
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
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = event.currentTarget
      const formData = new FormData(form)
      const parameters = convertFormDataToParameters(formData)

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
