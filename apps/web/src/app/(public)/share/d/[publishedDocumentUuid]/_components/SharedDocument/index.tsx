'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { capitalize } from 'lodash-es'

import { Commit, PublishedDocument } from '@latitude-data/core/browser'
import { ConversationMetadata } from '@latitude-data/promptl'
import { Button, Card, CardContent, cn, Input } from '@latitude-data/web-ui'

import { Container } from '../Container'
import { PromptHeader } from '../Header'
import { Messages } from '../Messages'
import { usePrompt } from './usePrompt'
import { useChat } from './useChat'

// Sync with the CSS transition duration
const DURATION_CLASS = 'duration-100 ease-in-out'
const DURATION_MS_RUN = 100
const DURATION_MS_RESET = 100

function useParameters({ parameters }: { parameters: Set<string> }) {
  return useRef(
    Array.from(parameters).map((parameter) => ({
      label: capitalize(parameter),
      value: parameter,
    })),
  ).current
}

type ServerClientMetadata = Omit<ConversationMetadata, 'setConfig'>

function PromptForm({
  metadata,
  onSubmit,
}: {
  metadata: ServerClientMetadata
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const parameters = useParameters({ parameters: metadata.parameters })
  return (
    <form className='h-full flex flex-col gap-y-4' onSubmit={onSubmit}>
      {parameters.map((parameter) => {
        return (
          <Input
            key={parameter.value}
            name={parameter.value}
            label={parameter.label}
          />
        )
      })}
      <Button fancy fullWidth type='submit' variant='default'>
        Run prompt
      </Button>
    </form>
  )
}

export function SharedDocument({
  metadata,
  shared,
}: {
  metadata: ServerClientMetadata
  shared: PublishedDocument
  commit: Commit
}) {
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

      setFormVisible(false)
      setFormHeight(undefined)

      // Give time to animation to finish
      setTimeout(async () => {
        const formData = new FormData(form)
        setChatVisible(true)
        await prompt.runPrompt(formData)
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
    prompt.resetPrompt()
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
          style={{ minWidth: originalFormWidth.current }}
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
              style={{ height: formHeight }}
            >
              <div
                ref={formRef}
                className={cn(
                  'transform transition-transform',
                  DURATION_CLASS,
                  {
                    'absolute inset-0':
                      originalFormHeight.current !== undefined,
                    'translate-y-0': isFormVisible,
                    '-translate-y-full': !isFormVisible,
                  },
                )}
              >
                <PromptForm metadata={metadata} onSubmit={onSubmit} />
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
                <Messages
                  isStreaming={prompt.isStreaming}
                  isLoadingPrompt={prompt.isLoadingPrompt}
                  responseStream={prompt.responseStream}
                  conversation={prompt.conversation}
                  chainLength={prompt.chainLength}
                  time={prompt.time}
                  error={prompt.error}
                  onChat={onChat}
                  onReset={onReset}
                  canChat={shared.canFollowConversation}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}
