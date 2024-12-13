import { useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  AssistantMessage,
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
  AnimatedDots,
  ChatTextArea,
  cn,
  ErrorMessage,
  Icon,
  LineSeparator,
  Message,
  MessageList,
  Text,
  Tooltip,
  useAutoScroll,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { LanguageModelUsage } from 'ai'
import { readStreamableValue } from 'ai/rsc'

import { DocumentEditorContext } from '..'
import Actions, { ActionsState } from './Actions'

export default function Chat({
  document,
  parameters,
  clearChat,
  expandParameters,
  setExpandParameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
  clearChat: () => void
} & ActionsState) {
  const [documentLogUuid, setDocumentLogUuid] = useState<string>()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { runDocumentAction, addMessagesAction } = useContext(
    DocumentEditorContext,
  )!
  const [error, setError] = useState<Error | undefined>()
  const [usage, setUsage] = useState<LanguageModelUsage | undefined>()
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const [time, setTime] = useState<number>()
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
  const [isStreaming, setIsStreaming] = useState(false)

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
    const start = performance.now()
    setError(undefined)
    setResponseStream('')
    setIsStreaming(true)
    setUsage({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    })
    let response = ''
    let messagesCount = 0

    try {
      const { response: actionResponse, output } = await runDocumentAction({
        projectId: project.id,
        documentPath: document.path,
        commitUuid: commit.uuid,
        parameters,
      })

      actionResponse.then((r) => {
        setDocumentLogUuid(r?.uuid)
      })

      for await (const serverEvent of readStreamableValue(output)) {
        if (!serverEvent) continue

        const { event, data } = serverEvent

        if ('messages' in data) {
          setResponseStream(undefined)
          data.messages!.forEach(addMessageToConversation)
          messagesCount += data.messages!.length
        }

        switch (event) {
          case StreamEventTypes.Latitude: {
            if (data.type === ChainEventTypes.StepComplete) {
              response = ''
            } else if (data.type === ChainEventTypes.Complete) {
              setUsage(data.response.usage)
              setChainLength(messagesCount)
              setTime(performance.now() - start)
            } else if (data.type === ChainEventTypes.Error) {
              setError(new Error(data.error.message))
            }

            break
          }

          case StreamEventTypes.Provider: {
            if (data.type === 'text-delta') {
              response += data.textDelta
              setResponseStream(response)
            }
            break
          }
          default:
            break
        }
      }
    } catch (error) {
      setError(error as Error)
    } finally {
      setIsStreaming(false)
      setResponseStream(undefined)
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

      setResponseStream('')

      addMessageToConversation(message)

      let response = ''

      try {
        const { output } = await addMessagesAction({
          documentLogUuid,
          messages: [message],
        })

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === ChainEventTypes.Error) {
                setError(new Error(data.error.message))
              } else if (data.type === ChainEventTypes.Complete) {
                addMessageToConversation({
                  role: MessageRole.assistant,
                  content: data.response.text,
                } as AssistantMessage)

                setUsage(data.response.usage)

                setResponseStream(undefined)
              }

              break
            }

            case StreamEventTypes.Provider: {
              if (data.type === 'text-delta') {
                response += data.textDelta
                setResponseStream(response)
              }
              break
            }
            default:
              break
          }
        }
      } catch (error) {
        setError(error as Error)
      } finally {
        setResponseStream(undefined)
      }
    },
    [addMessageToConversation, setError, documentLogUuid],
  )

  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      <div className='flex flex-row items-center justify-between w-full'>
        <Text.H6M>Prompt</Text.H6M>
        <Actions
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      </div>
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar scrollable-indicator pb-12'
      >
        <MessageList
          messages={conversation?.messages.slice(0, chainLength - 1) ?? []}
          parameters={Object.keys(parameters)}
          collapseParameters={!expandParameters}
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
      <div className='flex relative flex-row w-full items-center justify-center'>
        <TokenUsage
          isScrolledToBottom={isScrolledToBottom}
          usage={usage}
          isStreaming={isStreaming}
        />
        <ChatTextArea
          clearChat={clearChat}
          placeholder='Enter followup message...'
          disabled={isStreaming}
          onSubmit={submitUserMessage}
        />
      </div>
    </div>
  )
}

export function TokenUsage({
  isScrolledToBottom,
  usage,
  isStreaming,
}: {
  isScrolledToBottom: boolean
  usage: LanguageModelUsage | undefined
  isStreaming: boolean
}) {
  if (!usage && isStreaming) return null

  return (
    <div
      className={cn(
        'absolute -top-10 bg-background rounded-xl p-2 flex flex-row gap-2',
        {
          'shadow-xl': !isScrolledToBottom,
        },
      )}
    >
      {!isStreaming && usage ? (
        <Tooltip
          side='top'
          align='center'
          sideOffset={5}
          delayDuration={250}
          trigger={
            <div className='cursor-pointer flex flex-row items-center gap-x-1'>
              <Text.H6M color='foregroundMuted'>
                {usage?.totalTokens} tokens
              </Text.H6M>
              <Icon name='info' color='foregroundMuted' />
            </div>
          }
        >
          <div className='flex flex-col gap-2'>
            <Text.H6M color='foregroundMuted'>
              {usage?.promptTokens} prompt tokens
            </Text.H6M>
            <Text.H6M color='foregroundMuted'>
              {usage?.completionTokens} completion tokens
            </Text.H6M>
          </div>
        </Tooltip>
      ) : (
        <AnimatedDots />
      )}
    </div>
  )
}

export function StreamMessage({
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

  return (
    <Message
      role={MessageRole.assistant}
      content={[{ type: ContentType.text, text: responseStream }]}
    />
  )
}

export function Timer({ timeMs }: { timeMs: number }) {
  return <LineSeparator text={`${(timeMs / 1_000).toFixed(2)} s`} />
}
