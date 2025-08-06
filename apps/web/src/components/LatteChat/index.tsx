'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useRef } from 'react'
import { LatteMessageList } from './_components/MessageList'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { LatteChatInput } from './LatteChatInput'
import Image from 'next/image'
import { useLatteStore } from '$/stores/latte'
import {
  useLatteChangeActions,
  useLatteChatActions,
  useLoadThreadFromProviderLogs,
  useSyncLatteUrlState,
} from '$/hooks/latte'

export function LatteChat() {
  useLoadThreadFromProviderLogs()
  useSyncLatteUrlState()

  const {
    isLoading,
    resetChat,
    interactions,
    error,
    changes,
    latteActionsFeedbackUuid,
  } = useLatteStore()

  const { sendMessage } = useLatteChatActions()
  const { acceptChanges, undoChanges, addFeedbackToLatteChange } =
    useLatteChangeActions()

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

  return (
    <div className='w-full h-full max-h-full flex flex-col items-center bg-latte-background'>
      <div className='flex-1 flex flex-col h-full w-full items-center gap-4 max-w-[1200px] m-auto'>
        <div className='flex-grow min-h-0 h-full w-full flex flex-col items-center justify-center relative'>
          <div
            className='w-full h-full  overflow-hidden custom-scrollbar flex flex-col gap-4 items-center'
            ref={containerRef}
          >
            {!inConversation ? (
              <div className='flex flex-col items-center justify-center h-full gap-8 min-w-[50%]'>
                <div className='flex flex-col items-center justify-center gap-6'>
                  <Image src='/latte.svg' alt='Latte' width={64} height={64} />
                  <div className='flex flex-col items-center justify-center gap-2'>
                    <Text.H3M>What do you want to automate today?</Text.H3M>
                    <Text.H5 color='foregroundMuted'>
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
                  isLoading={isLoading}
                  feedbackRequested={!!latteActionsFeedbackUuid}
                  addFeedbackToLatteChange={addFeedbackToLatteChange}
                />
              </div>
            ) : (
              <>
                <LatteMessageList interactions={interactions} />
                {error && (
                  <div className='w-full max-w-[600px]'>
                    <Alert
                      variant='destructive'
                      direction='column'
                      description={error}
                      cta={
                        <Button variant='outline' onClick={resetChat}>
                          Start a new conversation
                        </Button>
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
          {inConversation && (
            <div className='w-full p-8'>
              <LatteChatInput
                inConversation
                sendMessage={sendMessage}
                resetChat={resetChat}
                changes={changes}
                undoChanges={undoChanges}
                acceptChanges={acceptChanges}
                error={error}
                scrollToBottom={scrollToBottom}
                isLoading={isLoading}
                feedbackRequested={!!latteActionsFeedbackUuid}
                addFeedbackToLatteChange={addFeedbackToLatteChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
