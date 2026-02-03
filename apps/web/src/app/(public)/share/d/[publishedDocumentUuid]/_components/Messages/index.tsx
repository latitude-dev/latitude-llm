import { useRef, useState } from 'react'

import { ChatTextArea } from '$/components/ChatWrapper'
import { Conversation } from '@latitude-data/constants/messages'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { cn } from '@latitude-data/web-ui/utils'
import { LastMessage } from '../SharedDocument/RunPrompt/usePrompt'
import { AllMessages } from './AllMessages'
import { ChatMessages } from './ChatMessages'
import { LastMessageOnly, useFakeStream } from './LastMessageOnly'

export function StreamingIndicator({
  isScrolledToBottom,
}: {
  isScrolledToBottom: boolean
}) {
  return (
    <div
      className={cn(
        'absolute -top-10 bg-background rounded-xl p-2 flex flex-row gap-2',
        {
          'shadow-xl': !isScrolledToBottom,
        },
      )}
    >
      <AnimatedDots />
    </div>
  )
}

export function Messages({
  isStreaming,
  isLoadingPrompt,
  responseStream,
  reasoningStream,
  conversation,
  chainLength,
  error,
  onChat,
  onReset,
  canChat = false,
  lastMessage,
}: {
  responseStream: string | undefined
  reasoningStream: string | undefined
  isLoadingPrompt: boolean
  isStreaming: boolean
  conversation: Conversation | undefined
  chainLength: number
  error: Error | undefined
  onChat: (value: string) => void
  onReset: () => void
  canChat: boolean | undefined
  lastMessage: LastMessage | undefined
}) {
  const [showPromptMessages, setPromptVisibility] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const { fakeIsStreaming, fakeResponseStream } = useFakeStream({ lastMessage })
  const streaming = showPromptMessages ? isStreaming : fakeIsStreaming
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })
  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar pb-4'
      >
        {showPromptMessages ? (
          <AllMessages
            isLoadingPrompt={isLoadingPrompt}
            messages={conversation?.messages ?? []}
            error={error}
            responseStream={responseStream}
            reasoningStream={reasoningStream}
            conversation={conversation}
            chainLength={chainLength}
            setPromptVisibility={setPromptVisibility}
          />
        ) : (
          <LastMessageOnly
            isLoadingPrompt={isLoadingPrompt}
            lastMessage={lastMessage}
            responseStream={fakeResponseStream}
            reasoningStream={reasoningStream}
            isStreaming={fakeIsStreaming}
            error={error}
            setPromptVisibility={setPromptVisibility}
          />
        )}

        <ChatMessages
          conversation={conversation}
          responseStream={responseStream}
          reasoningStream={reasoningStream}
          chainLength={chainLength}
          error={error}
        />
      </div>

      <div className='sticky bottom-0 flex flex-row w-full items-center justify-center'>
        {streaming ? (
          <StreamingIndicator isScrolledToBottom={isScrolledToBottom} />
        ) : null}

        {canChat ? (
          <ChatTextArea
            canChat
            onClear={onReset}
            onSubmit={onChat}
            minRows={5}
            placeholder='Ask anything'
          />
        ) : (
          <Button fancy variant='default' onClick={onReset}>
            Run again
          </Button>
        )}
      </div>
    </div>
  )
}
