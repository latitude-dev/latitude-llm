import { useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  ContentType,
  Conversation,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/compiler'
import {
  ChainEventTypes,
  StreamEventTypes,
  type DocumentVersion,
} from '@latitude-data/core/browser'
import {
  ChatTextArea,
  cn,
  ErrorMessage,
  Message,
  MessageList,
  Text,
  useAutoScroll,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { readStreamableValue } from 'ai/rsc'

import { DocumentEditorContext } from '..'

export default function Chat({
  document,
  parameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
}) {
  const [documentLogUuid, setDocumentLogUuid] = useState<string>()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { runDocumentAction, addMessagesAction } = useContext(
    DocumentEditorContext,
  )!
  const [error, setError] = useState<Error | undefined>()
  const [tokens, setTokens] = useState<number>(0)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const [startTime, _] = useState(performance.now())
  const [endTime, setEndTime] = useState<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  const runChainOnce = useRef(false)
  // Index where the chain ends and the chat begins
  const [chainLength, setChainLength] = useState<number>(Infinity)
  const [conversation, setConversation] = useState<Conversation | undefined>()
  const [responseStream, setResponseStream] = useState<string | undefined>()

  const addMessageToConversation = useCallback(
    (message: ConversationMessage) => {
      let newConversation: Conversation
      setConversation((prevConversation) => {
        newConversation = {
          ...prevConversation,
          messages: [...(prevConversation?.messages ?? []), message],
        } as Conversation
        return newConversation
      })
      return newConversation!
    },
    [],
  )

  const runDocument = useCallback(async () => {
    setError(undefined)
    setResponseStream(undefined)

    let response = ''
    let messagesCount = 0

    const { response: actionResponse, output } = await runDocumentAction({
      projectId: project.id,
      documentPath: document.path,
      commitUuid: commit.uuid,
      parameters,
    })

    actionResponse.then((res) => {
      setDocumentLogUuid(res?.response?.documentLogUuid)
    })

    for await (const serverEvent of readStreamableValue(output)) {
      if (!serverEvent) continue

      const { event, data } = serverEvent

      const hasMessages = 'messages' in data

      if (hasMessages) {
        data.messages.forEach(addMessageToConversation)
        messagesCount += data.messages.length
      }

      switch (event) {
        case StreamEventTypes.Latitude: {
          if (data.type === ChainEventTypes.Step) {
            if (data.isLastStep) setChainLength(messagesCount + 1)
          } else if (data.type === ChainEventTypes.Complete) {
            setTokens(data.response.usage.totalTokens)
            setEndTime(performance.now())
          } else if (data.type === ChainEventTypes.Error) {
            setError(new Error(data.error.message))
          }
          break
        }

        case StreamEventTypes.Provider: {
          if (data.type === 'text-delta') {
            response += data.textDelta
            setResponseStream(response)
          } else if (data.type === 'finish') {
            setResponseStream(undefined)
            response = ''
          }
          break
        }
        default:
          break
      }
    }
  }, [
    project.id,
    document.path,
    commit.uuid,
    parameters,
    runDocumentAction,
    addMessageToConversation,
  ])

  useEffect(() => {
    if (runChainOnce.current) return

    runChainOnce.current = true // Prevent double-running when StrictMode is enabled
    runDocument()
  }, [runDocument])

  const submitUserMessage = useCallback(
    async (input: string) => {
      if (!documentLogUuid) return // This should not happen

      const message: ConversationMessage = {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: input }],
      }
      let response = ''
      addMessageToConversation(message)
      const { output } = await addMessagesAction({
        documentLogUuid,
        messages: [message],
      })
      for await (const serverEvent of readStreamableValue(output)) {
        if (!serverEvent) continue

        const { event, data } = serverEvent

        const hasMessages = 'messages' in data

        if (hasMessages) {
          data.messages.forEach(addMessageToConversation)
        }

        switch (event) {
          case StreamEventTypes.Latitude: {
            if (data.type === ChainEventTypes.Error) {
              setError(new Error(data.error.message))
            }
            break
          }

          case StreamEventTypes.Provider: {
            if (data.type === 'text-delta') {
              response += data.textDelta
              setResponseStream(response)
            } else if (data.type === 'finish') {
              setResponseStream(undefined)
              response = ''
            }
            break
          }
          default:
            break
        }
      }
    },
    [addMessageToConversation, setError, documentLogUuid],
  )

  return (
    <div className='flex flex-col h-full'>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 h-full overflow-y-auto pb-12'
      >
        <Text.H6M>Prompt</Text.H6M>
        <MessageList
          messages={conversation?.messages.slice(0, chainLength - 1) ?? []}
        />
        {(conversation?.messages.length ?? 0) >= chainLength && (
          <>
            <MessageList
              messages={
                conversation?.messages.slice(chainLength - 1, chainLength) ?? []
              }
              variant='accent'
            />
            {endTime && <Timer timeMs={endTime - startTime} />}
          </>
        )}
        {(conversation?.messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList
              messages={conversation!.messages.slice(chainLength)}
              variant='outline'
            />
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
      <div className='flex relative flex-row w-full items-center justify-center'>
        <TokenUsage
          isScrolledToBottom={isScrolledToBottom}
          tokens={tokens}
          responseStream={responseStream}
        />
        <ChatTextArea
          placeholder='Enter followup message...'
          disabled={responseStream !== undefined}
          onSubmit={submitUserMessage}
        />
      </div>
    </div>
  )
}

function AnimatedDots() {
  return (
    <span className='flex flex-row items-center gap-1'>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse'>•</span>
      </Text.H6M>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse delay-250'>•</span>
      </Text.H6M>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse delay-500'>•</span>
      </Text.H6M>
    </span>
  )
}

function TokenUsage({
  isScrolledToBottom,
  tokens,
  responseStream,
}: {
  isScrolledToBottom: boolean
  tokens: number
  responseStream: string | undefined
}) {
  if (!tokens && responseStream === undefined) return null

  return (
    <div
      className={cn(
        'absolute -top-10 bg-background rounded-xl p-2 flex flex-row gap-2',
        {
          'shadow-xl': !isScrolledToBottom,
        },
      )}
    >
      {responseStream === undefined ? (
        <Text.H6M color='foregroundMuted'>{tokens} tokens</Text.H6M>
      ) : (
        <AnimatedDots />
      )}
    </div>
  )
}

function StreamMessage({
  responseStream,
  conversation,
  chainLength,
}: {
  responseStream: string | undefined
  conversation: Conversation | undefined
  chainLength: number
}) {
  if (responseStream === undefined) return null
  if (conversation === undefined) return null
  if (conversation.messages.length < chainLength - 1) {
    return (
      <Message
        role={MessageRole.assistant}
        content={[{ type: ContentType.text, text: responseStream }]}
        animatePulse
      />
    )
  }
  if (conversation.messages.length === chainLength - 1) {
    return (
      <Message
        role={MessageRole.assistant}
        content={[{ type: ContentType.text, text: responseStream }]}
        variant='accent'
      />
    )
  }

  return (
    <Message
      role={MessageRole.assistant}
      content={[{ type: ContentType.text, text: responseStream }]}
      variant='outline'
    />
  )
}

function Timer({ timeMs }: { timeMs: number }) {
  return (
    <div className='flex flex-row items-center'>
      <div className='flex-grow h-px bg-muted-foreground/40' />
      <div className='flex px-2 items-center'>
        <Text.H6 color='foregroundMuted'>
          {`${(timeMs / 1_000).toFixed(2)} s`}
        </Text.H6>
      </div>
      <div className='flex-grow h-px bg-muted-foreground/40' />
    </div>
  )
}
