import { useRef, useState } from 'react'

import { Conversation } from '@latitude-data/compiler'
import {
  Button,
  ChatTextArea,
  cn,
  ErrorMessage,
  MessageList,
  MessageSkeleton,
  Text,
  useAutoScroll,
} from '@latitude-data/web-ui'
import {
  AnimatedDots,
  StreamMessage,
  Timer,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/Chat'
import { randomRoleVariant } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/Chat/Message/helpers'

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

// <Skeleton height='h6'>
export function SkeletonMessageList({ messages }: { messages: number }) {
  return (
    <div className='flex flex-col gap-4'>
      {Array.from({ length: messages }).map((_, index) => (
        <MessageSkeleton key={index} role={randomRoleVariant()} />
      ))}
    </div>
  )
}

export function Messages({
  isStreaming,
  isLoadingPrompt,
  responseStream,
  conversation,
  chainLength,
  time,
  error,
  onChat,
  onReset,
  canChat = false,
}: {
  responseStream: string | undefined
  isLoadingPrompt: boolean
  isStreaming: boolean
  conversation: Conversation | undefined
  chainLength: number
  time: number | undefined
  error: Error | undefined
  onChat: (value: string) => void
  onReset: () => void
  canChat: boolean | undefined
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
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
        {isLoadingPrompt && <SkeletonMessageList messages={5} />}

        <MessageList
          messages={conversation?.messages.slice(0, chainLength - 1) ?? []}
        />
        {(conversation?.messages.length ?? 0) >= chainLength && (
          <>
            <MessageList
              messages={
                conversation?.messages.slice(chainLength - 1, chainLength) ?? []
              }
            />
            {time && <Timer timeMs={time} />}
          </>
        )}
        {(conversation?.messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList messages={conversation!.messages.slice(chainLength)} />
          </>
        )}
        {error ? (
          <ErrorMessage error={error} />
        ) : (
          <StreamMessage
            responseStream={responseStream}
            conversation={conversation}
            chainLength={chainLength}
          />
        )}
      </div>
      <div className='sticky bottom-0 flex flex-row w-full items-center justify-center'>
        {isStreaming ? (
          <StreamingIndicator isScrolledToBottom={isScrolledToBottom} />
        ) : null}
        {canChat ? (
          <ChatTextArea
            clearChat={onReset}
            onSubmit={onChat}
            placeholder='Enter followup message...'
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
