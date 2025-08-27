'use client'

import {
  useLatteChangeActions,
  useLatteChatActions,
  useLoadThreadFromProviderLogs,
  useSyncLatteUrlState,
} from '$/hooks/latte'
import { useOnce } from '$/hooks/useMount'
import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { useLatteStore } from '$/stores/latte'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { useCallback, useRef, useState } from 'react'
import { ChatSkeleton } from './_components/ChatSkeleton'
import { LatteUsageInfo } from './_components/LatteUsageInfo'
import { LatteMessageList } from './_components/MessageList'
import { LatteChatInput } from './LatteChatInput'

export function LatteChat() {
  const { data: workspace } = useCurrentWorkspace()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  useSyncLatteUrlState()

  const isBrewingThread = useLoadThreadFromProviderLogs()

  const {
    isBrewing,
    resetChat: resetChatStore,
    interactions,
    error,
    changes,
    latteActionsFeedbackUuid,
    usage,
    jobId,
  } = useLatteStore()

  const { sendMessage, stopChat } = useLatteChatActions()
  const { acceptChanges, undoChanges, addFeedbackToLatteChange } =
    useLatteChangeActions()

  const resetChat = useCallback(() => {
    resetChatStore()
    addFeedbackToLatteChange('')
  }, [resetChatStore, addFeedbackToLatteChange])

  const stopLatteChat = useCallback(() => {
    stopChat({ jobId: jobId })
  }, [stopChat, jobId])

  const inConversation = interactions.length > 0
  const containerRef = useRef<HTMLDivElement>(null)

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

  useOnce(() => {
    if (!playgroundAction) return
    const { prompt } = playgroundAction
    resetPlaygroundAction()
    resetChat()
    setTimeout(() => sendMessage(prompt)) // Note: using empty setTimeout to execute sendMessage in the next tick
  })

  return (
    <div className='w-full h-full max-h-full flex flex-col items-center bg-latte-background'>
      <div className='flex-1 flex flex-col h-full w-full items-center gap-4 min-w-[300px] max-w-[1200px] m-auto flex-shrink-0'>
        <div className='flex-grow min-h-0 h-full w-full flex flex-col items-center justify-center relative'>
          <div
            className='w-full h-full overflow-hidden custom-scrollbar flex flex-col gap-4 items-center shadow-sm pb-8'
            ref={containerRef}
          >
            {isBrewingThread && !isBrewing && <ChatSkeleton />}
            {!isBrewingThread &&
              (!inConversation ? (
                <div className='flex flex-col items-center justify-center h-full gap-8 min-w-[50%] p-8'>
                  <div className='flex flex-col items-center justify-center gap-6'>
                    <Image
                      src='/latte.svg'
                      alt='Latte'
                      width={80}
                      height={80}
                      className={cn('select-none duration-500 h-auto', {
                        'animate-spin': animateLatte,
                      })}
                      onDoubleClick={() => setAnimateLatte((prev) => !prev)}
                      unselectable='on'
                      unoptimized
                    />
                    <div className='flex flex-col items-center justify-center gap-2'>
                      <Text.H3M centered>
                        What do you want to automate today?
                      </Text.H3M>
                      <Text.H5 color='foregroundMuted' centered>
                        Chat with Latte to build and improve your agent
                      </Text.H5>
                    </div>
                  </div>
                  <LatteChatInput
                    sendMessage={sendMessage}
                    resetChat={resetChat}
                    changes={changes}
                    undoChanges={undoChanges}
                    acceptChanges={acceptChanges}
                    error={error}
                    inConversation={false}
                    scrollToBottom={scrollToBottom}
                    isBrewing={isBrewing}
                    feedbackRequested={!!latteActionsFeedbackUuid}
                    addFeedbackToLatteChange={addFeedbackToLatteChange}
                  />
                </div>
              ) : (
                <>
                  <LatteMessageList
                    interactions={interactions}
                    isStreaming={isBrewing}
                  />
                  {error && (
                    <div className='w-full px-8'>
                      <Alert
                        variant='destructive'
                        direction='column'
                        spacing='small'
                        title='Oh no, something went wrong'
                        description={error}
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
                            className='text-destructive-muted-foreground'
                            userSelect={false}
                          >
                            Start a new chat
                          </Button>
                        }
                        className='rounded-2xl'
                      />
                    </div>
                  )}
                </>
              ))}
          </div>
          {inConversation && (
            <div className='w-full p-8 flex flex-col gap-4 items-center justify-center'>
              <LatteChatInput
                inConversation
                sendMessage={sendMessage}
                resetChat={resetChat}
                changes={changes}
                undoChanges={undoChanges}
                acceptChanges={acceptChanges}
                error={error}
                scrollToBottom={scrollToBottom}
                isBrewing={isBrewing}
                feedbackRequested={!!latteActionsFeedbackUuid}
                addFeedbackToLatteChange={addFeedbackToLatteChange}
                stopLatteChat={stopLatteChat}
              />
              {!!usage && !!workspace && (
                <LatteUsageInfo
                  usage={usage}
                  plan={workspace.currentSubscription.plan}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
