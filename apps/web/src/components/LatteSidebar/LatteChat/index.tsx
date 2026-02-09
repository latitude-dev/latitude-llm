'use client'

import { useLatteContext } from '$/hooks/latte/context'
import { useLatteChangeActions } from '$/hooks/latte/useLatteChangeActions'
import { useLatteChatActions } from '$/hooks/latte/useLatteChatActions'
import { useLatteEventHandlers } from '$/hooks/latte/useLatteEventHandlers'
import { useLoadThread } from '$/hooks/latte/useLoadThread/index'
import { useOnce } from '$/hooks/useMount'
import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { useLatteStore } from '$/stores/latte'
import { LatitudeErrorCodes } from '@latitude-data/constants/errors'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StarburstBadge } from '@latitude-data/web-ui/atoms/StarburstBadge'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { ReactNode, RefObject, useCallback, useRef, useState } from 'react'
import React from 'react'
import { ChatSkeleton } from './_components/ChatSkeleton'
import { LatteUsageInfo } from './_components/LatteUsageInfo'
import { LatteMessageList } from './_components/MessageList'
import { PaymentRequiredAlert } from './_components/PaymentRequiredAlert'
import { LatteUnconfiguredIntegrations } from './_components/UnconfiguredIntegrations'
import { LatteChatInput } from './LatteChatInput'
import type { Message } from '@latitude-data/constants/messages'

export function LatteChat({
  initialThreadUuid,
  initialMessages,
  inputRef,
}: {
  initialThreadUuid?: string
  initialMessages?: Message[]
  inputRef?: RefObject<HTMLTextAreaElement>
}) {
  const isLoading = useLoadThread({ initialThreadUuid, initialMessages })

  if (isLoading)
    return (
      <ChatWrapper>
        <ChatSkeleton />
      </ChatWrapper>
    )

  return <LatteChatUI inputRef={inputRef} />
}

function ChatWrapper({ children }: { children: ReactNode }) {
  return (
    <div className='w-full h-full max-h-full flex flex-col items-center bg-latte-background'>
      {children}
    </div>
  )
}

function LatteChatInputSection({
  error,
  inConversation,
  resetChat,
  scrollToBottom,
  sendMessage,
  stopLatteChat,
  inputRef: inputRef,
}: {
  error?: Error
  inConversation: boolean
  resetChat: () => void
  scrollToBottom: () => void
  sendMessage: (message: string) => void
  stopLatteChat?: () => void
  inputRef?: RefObject<HTMLTextAreaElement>
}) {
  const { data: workspace } = useCurrentWorkspace()
  const { usage } = useLatteStore()

  return (
    <div className='w-full flex flex-col gap-4 items-center justify-center'>
      <LatteChatInput
        error={error}
        inConversation={inConversation}
        resetChat={resetChat}
        scrollToBottom={scrollToBottom}
        sendMessage={sendMessage}
        stopLatteChat={stopLatteChat}
        inputRef={inputRef}
      />
      {!!usage && !!workspace && (
        <LatteUsageInfo
          usage={usage}
          plan={workspace.currentSubscription.plan}
        />
      )}
    </div>
  )
}

function LatteChatUI({
  inputRef,
}: {
  inputRef?: RefObject<HTMLTextAreaElement>
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { isBrewing, resetAll, interactions, error, jobId } = useLatteStore()
  const { sendMessage, stopChat } = useLatteChatActions()
  const { addFeedbackToLatteChange } = useLatteChangeActions()
  const { isLoading: isLoadingContext } = useLatteContext()
  const resetChat = useCallback(() => {
    addFeedbackToLatteChange('')
    resetAll()
  }, [resetAll, addFeedbackToLatteChange])
  const stopLatteChat = useCallback(() => {
    if (!jobId) return
    stopChat({ jobId })
  }, [stopChat, jobId])

  const inConversation = interactions.length > 0
  const containerRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return
    setTimeout(() => {
      containerRef.current!.scrollTop = containerRef.current!.scrollHeight
    }, 5)
  }, [])

  useAutoScroll(containerRef, {
    startAtBottom: true,
  })

  const [animateLatte, setAnimateLatte] = useState(false)

  const { playgroundAction, resetPlaygroundAction } = usePlaygroundAction({
    action: PlaygroundAction.RunLatte,
    project: project,
    commit: commit,
  })

  useLatteEventHandlers()
  useOnce(() => {
    if (!playgroundAction) return
    const { prompt } = playgroundAction
    resetPlaygroundAction()
    resetChat()
    setTimeout(() => sendMessage(prompt)) // Note: using empty setTimeout to execute sendMessage in the next tick
  }, !isLoadingContext)

  return (
    <ChatWrapper>
      <div className='flex-1 flex flex-col h-full w-full items-center gap-4 min-w-[300px] max-w-[1200px] m-auto flex-shrink-0'>
        <div className='flex-grow min-h-0 h-full w-full flex flex-col items-center justify-center relative'>
          <div
            className='w-full h-full overflow-hidden custom-scrollbar flex flex-col gap-4 items-center pb-8'
            ref={containerRef}
          >
            {!inConversation ? (
              <div className='flex flex-col items-center justify-center h-full gap-8 min-w-[50%] p-8'>
                <div className='flex flex-col items-center justify-center gap-6'>
                  <StarburstBadge
                    className='w-40 h-40'
                    backgroundColor='latteBackground'
                    borderColor='latteBadgeBorder'
                    spin
                  >
                    <div
                      style={{ transform: 'translate(4px, -5px)' }} // Custom adjustments because the Latte image looks off center to the naked eye due to the handle
                    >
                      <Image
                        src='/latte.svg'
                        alt='Latte'
                        width={100}
                        height={100}
                        style={{ width: 100, height: 100 }}
                        className={cn('select-none duration-500 h-auto', {
                          'animate-spin': animateLatte,
                        })}
                        onDoubleClick={() => setAnimateLatte((prev) => !prev)}
                        unselectable='on'
                        unoptimized
                      />
                    </div>
                  </StarburstBadge>
                  <div className='flex flex-col items-center justify-center gap-2'>
                    <Text.H3M centered>
                      What do you want to automate today?
                    </Text.H3M>
                    <Text.H5 color='foregroundMuted' centered>
                      Chat with Latte to build and improve your project
                    </Text.H5>
                  </div>
                </div>
                <LatteChatInputSection
                  error={error}
                  inConversation={false}
                  resetChat={resetChat}
                  scrollToBottom={scrollToBottom}
                  sendMessage={sendMessage}
                  inputRef={inputRef}
                />
              </div>
            ) : (
              <>
                <LatteMessageList
                  interactions={interactions}
                  isStreaming={isBrewing}
                />
                <LatteUnconfiguredIntegrations />
                {error && (
                  <div className='w-full px-8'>
                    {error.name === LatitudeErrorCodes.PaymentRequiredError ? (
                      <PaymentRequiredAlert />
                    ) : (
                      <Alert
                        variant='destructive'
                        direction='column'
                        spacing='small'
                        title='Oh no, something went wrong'
                        description={error.message}
                        cta={
                          <Button
                            variant='ghost'
                            size='none'
                            onClick={resetChat}
                            iconProps={{
                              name: 'rotate',
                              color: 'destructiveMutedForeground',
                              className: 'flex-shrink-0',
                            }}
                            textColor='destructiveMutedForeground'
                            userSelect={false}
                          >
                            Start a new chat
                          </Button>
                        }
                        className='rounded-2xl'
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {inConversation && (
            <div className='w-full p-8'>
              <LatteChatInputSection
                error={error}
                inConversation={true}
                resetChat={resetChat}
                scrollToBottom={scrollToBottom}
                sendMessage={sendMessage}
                stopLatteChat={stopLatteChat}
                inputRef={inputRef}
              />
            </div>
          )}
        </div>
      </div>
    </ChatWrapper>
  )
}
