'use client'
import { useLatte } from '$/hooks/latte'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useEffect, useRef } from 'react'
import { LatteMessageList } from './_components/MessageList'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import type { BotEmotion } from '@latitude-data/web-ui/molecules/DynamicBot'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { LatteChatInput } from './LatteChatInput'

export function LatteChat({
  setEmotion,
}: {
  emotion: BotEmotion
  setEmotion: (emotion: BotEmotion) => void
  reactWithEmotion: (emotion: BotEmotion, time?: number) => void
}) {
  const {
    sendMessage,
    isLoading,
    resetChat,
    interactions,
    error,
    changes,
    acceptChanges,
    undoChanges,
    feedbackRequested,
    addFeedbackToLatteChange,
  } = useLatte()

  const inConversation = interactions.length > 0

  useEffect(() => {
    setEmotion(isLoading ? 'thinking' : 'normal')
  }, [isLoading, setEmotion])

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
    <div className='w-full h-full max-h-full flex flex-col items-center'>
      <div className='flex flex-col h-full w-full items-center'>
        <div className='flex-grow min-h-0 h-full w-full flex flex-col items-center justify-center relative'>
          <div
            className='w-full h-full p-4 overflow-hidden custom-scrollbar flex flex-col gap-4 items-center'
            ref={containerRef}
          >
            {!inConversation ? (
              <div className='flex flex-col items-center justify-center h-full gap-4'>
                <Text.H1>Latte</Text.H1>
                <Text.H4 color='foregroundMuted'>Your Latitude copilot</Text.H4>
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
        </div>
        <LatteChatInput
          sendMessage={sendMessage}
          resetChat={resetChat}
          changes={changes}
          undoChanges={undoChanges}
          acceptChanges={acceptChanges}
          error={error}
          scrollToBottom={scrollToBottom}
          isLoading={isLoading}
          inConversation={inConversation}
          feedbackRequested={feedbackRequested}
          addFeedbackToLatteChange={addFeedbackToLatteChange}
        />
      </div>
    </div>
  )
}
