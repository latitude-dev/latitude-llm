import { useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  ContentType,
  Message as ConversationMessage,
  MessageRole,
} from '@latitude-data/compiler'
import { type DocumentVersion } from '@latitude-data/core/browser'
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

import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { type PromptlVersion } from '@latitude-data/web-ui'
import { DocumentEditorContext } from '..'
import Actions, { ActionsState } from './Actions'

export default function Chat<V extends PromptlVersion>({
  document,
  promptlVersion,
  parameters,
  clearChat,
  onPromptRan,
  expandParameters,
  setExpandParameters,
}: {
  document: DocumentVersion
  promptlVersion: V
  parameters: Record<string, unknown>
  clearChat: () => void
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
} & ActionsState) {
  const runOnce = useRef(false)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { runDocumentAction, addMessagesAction } = useContext(
    DocumentEditorContext,
  )!

  const runPromptFn = useCallback(async () => {
    const { response, output } = await runDocumentAction({
      projectId: project.id,
      documentPath: document.path,
      commitUuid: commit.uuid,
      parameters,
    })

    const documentLogUuid = new Promise<string>((resolve, _reject) => {
      response.then((r) => {
        if (!r?.uuid) {
          // TODO: This error is raised when the streaming returns an error
          // Without the uuid, we can't chat anymore.
          // reject(new Error('No document log uuid'))
          return
        }
        resolve(r.uuid)
      })
    })

    return { stream: output, documentLogUuid }
  }, [project.id, document.path, commit.uuid, parameters, runDocumentAction])

  const addMessagesFn = useCallback(
    async ({
      documentLogUuid,
      messages,
    }: {
      documentLogUuid: string
      messages: ConversationMessage[]
    }) => {
      const { output } = await addMessagesAction({
        documentLogUuid,
        messages,
      })

      return { stream: output }
    },
    [],
  )

  const {
    start,
    submitUserMessage,
    addMessages,
    unresponedToolCalls,
    error,
    usage,
    time,
    messages,
    streamingResponse,
    chainLength,
    isLoading,
  } = usePlaygroundChat({
    promptlVersion,
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  useEffect(() => {
    if (!runOnce.current) {
      runOnce.current = true
      start()
    }
  }, [start])

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
            responseStream={streamingResponse}
            messages={messages}
            chainLength={chainLength}
          />
        )}
      </div>
      <div className='flex relative flex-row w-full items-center justify-center'>
        <TokenUsage
          isScrolledToBottom={isScrolledToBottom}
          usage={usage}
          isStreaming={isLoading}
        />
        <ChatTextArea
          clearChat={clearChat}
          placeholder='Enter followup message...'
          disabled={isLoading || !!error}
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
