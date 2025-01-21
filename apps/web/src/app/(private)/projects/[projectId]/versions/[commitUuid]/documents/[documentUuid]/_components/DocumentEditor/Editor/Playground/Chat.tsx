import { useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  buildMessagesFromResponse,
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
import { useMessages } from './useMessages'
import { type PromptlVersion } from '@latitude-data/web-ui'

function buildMessage({ input }: { input: string | ToolMessage[] }) {
  if (typeof input === 'string') {
    return [
      {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: input }],
      } as ConversationMessage,
    ]
  }
  return input
}

export default function Chat<V extends PromptlVersion>({
  document,
  promptlVersion,
  parameters,
  clearChat,
  expandParameters,
  setExpandParameters,
}: {
  document: DocumentVersion
  promptlVersion: V
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
  const isChat = useRef(false)
  // Index where the chain ends and the chat begins
  const [chainLength, setChainLength] = useState<number>(Infinity)
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const { messages, addMessages, unresponedToolCalls } = useMessages<V>({
    version: promptlVersion,
  })
  const startStreaming = useCallback(() => {
    setError(undefined)
    setResponseStream('')
    setIsStreaming(true)
  }, [setError, setUsage, setResponseStream, setIsStreaming])

  const stopStreaming = useCallback(() => {
    setIsStreaming(false)
    setResponseStream(undefined)
  }, [setIsStreaming, setResponseStream])

  const runDocument = useCallback(async () => {
    const start = performance.now()
    let response = ''
    let messagesCount = 0
    startStreaming()

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
          addMessages(data.messages ?? [])
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
      stopStreaming()
    }
  }, [
    project.id,
    document.path,
    commit.uuid,
    parameters,
    runDocumentAction,
    addMessages,
    startStreaming,
    stopStreaming,
  ])

  useEffect(() => {
    if (runChainOnce.current) return

    runChainOnce.current = true // Prevent double-running when StrictMode is enabled
    runDocument()
  }, [runDocument])

  const submitUserMessage = useCallback(
    async (input: string | ToolMessage[]) => {
      if (!documentLogUuid) return // This should not happen

      const newMessages = buildMessage({ input })

      // Only in Chat mode we add optimistically the message
      if (typeof input === 'string') {
        isChat.current = true
        addMessages(newMessages)
      }

      if (!isChat.current) {
        setChainLength((prev) => prev + newMessages.length)
      }

      let response = ''
      const start = performance.now()
      let messagesCount = 0
      startStreaming()

      try {
        const { output } = await addMessagesAction({
          documentLogUuid,
          messages: newMessages,
        })

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          const { event, data } = serverEvent

          if (data.type === ChainEventTypes.Step) {
            setResponseStream('')
            addMessages(data.messages ?? [])
            messagesCount += data.messages?.length ?? 0
          }

          if (data.type === ChainEventTypes.StepComplete) {
            const responseMsgs = buildMessagesFromResponse(data)
            setResponseStream(undefined)
            addMessages(responseMsgs)
            messagesCount += responseMsgs.length
          }

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === ChainEventTypes.Complete) {
                if (!isChat.current) {
                  // Update chain statistics
                  setChainLength((prev) => prev + messagesCount)
                  setTime((prev) => (prev ?? 0) + (performance.now() - start))
                }
                setUsage((prev) => ({
                  promptTokens:
                    (prev?.promptTokens ?? 0) +
                    data.response.usage.promptTokens,
                  completionTokens:
                    (prev?.completionTokens ?? 0) +
                    data.response.usage.completionTokens,
                  totalTokens:
                    (prev?.totalTokens ?? 0) + data.response.usage.totalTokens,
                }))
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
        stopStreaming()
      }
    },
    [
      documentLogUuid,
      addMessagesAction,
      addMessages,
      startStreaming,
      stopStreaming,
    ],
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
          messages={messages.slice(0, chainLength - 1) ?? []}
          parameters={Object.keys(parameters)}
          collapseParameters={!expandParameters}
        />
        {(messages.length ?? 0) >= chainLength && (
          <>
            <MessageList
              messages={messages.slice(chainLength - 1, chainLength) ?? []}
            />
            {time && <Timer timeMs={time} />}
          </>
        )}
        {(messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList messages={messages.slice(chainLength)} />
          </>
        )}
        {error ? (
          <ErrorMessage error={error} />
        ) : (
          <StreamMessage
            responseStream={responseStream}
            messages={messages}
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
          toolRequests={unresponedToolCalls}
          addMessages={addMessages}
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
                {usage?.totalTokens ||
                  usage?.promptTokens ||
                  usage?.completionTokens ||
                  0}{' '}
                tokens
              </Text.H6M>
              <Icon name='info' color='foregroundMuted' />
            </div>
          }
        >
          <div className='flex flex-col gap-2'>
            <span>{usage?.promptTokens || 0} prompt tokens</span>
            <span>{usage?.completionTokens || 0} completion tokens</span>
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
  messages,
  chainLength,
}: {
  responseStream: string | undefined
  messages: ConversationMessage[]
  chainLength: number
}) {
  if (responseStream === undefined) return null
  if (messages.length < chainLength - 1) {
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
