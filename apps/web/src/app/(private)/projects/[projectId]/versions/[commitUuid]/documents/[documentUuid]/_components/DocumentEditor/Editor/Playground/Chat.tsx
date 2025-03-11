import { useCallback, useEffect, useRef, useState } from 'react'
import { Message as ConversationMessage } from '@latitude-data/compiler'
import { type DocumentVersion } from '@latitude-data/core/browser'
import {
  ChatTextArea,
  ErrorMessage,
  MessageList,
  Text,
  useAutoScroll,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'

import Actions, { ActionsState } from './Actions'
import { StatusIndicator, StreamMessage, Timer } from './components'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { useToolContentMap } from 'node_modules/@latitude-data/web-ui/src/lib/hooks/useToolContentMap'
import { useStreamHandler } from './hooks/useStreamHandler'
import { ROUTES } from '$/services/routes'

export default function Chat({
  document,
  parameters,
  clearChat,
  onPromptRan,
  expandParameters,
  setExpandParameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
  clearChat: () => void
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
} & ActionsState) {
  const runOnce = useRef(false)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Setup auto-scroll behavior
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })

  // Get project and commit information
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  // Get agent tools map
  const { data: agentToolsMap } = useAgentToolsMap({
    commitUuid: commit.uuid,
    projectId: project.id,
  })

  // Custom hook for handling streaming responses
  const { createStreamHandler, abortCurrentStream, hasActiveStream } =
    useStreamHandler()

  // Create run prompt function with proper error handling
  const runPromptFn = useCallback(async () => {
    try {
      const response = await fetch(
        ROUTES.api.documents.detail(document.documentUuid).run,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: document.path,
            commitUuid: commit.uuid,
            parameters,
            projectId: project.id,
            stream: true, // Explicitly request streaming
          }),
        },
      )

      return createStreamHandler(response)
    } catch (error) {
      console.error('Error running prompt:', error)
      throw error
    }
  }, [
    project.id,
    document.path,
    document.documentUuid,
    commit.uuid,
    parameters,
    createStreamHandler,
  ])

  // Create add messages function
  const addMessagesFn = useCallback(
    async ({
      documentLogUuid,
      messages,
    }: {
      documentLogUuid: string
      messages: ConversationMessage[]
    }) => {
      const response = await fetch(
        ROUTES.api.documents.logs.detail(documentLogUuid).chat,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
          }),
        },
      )

      return createStreamHandler(response)
    },
    [createStreamHandler],
  )

  // Initialize playground chat
  const {
    start,
    submitUserMessage,
    addMessages,
    unresponedToolCalls,
    error,
    usage,
    time,
    messages,
    runningLatitudeTools,
    streamingResponse,
    chainLength,
    isLoading,
  } = usePlaygroundChat({
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  // Function to stop the streaming response with confirmation
  const stopStreaming = useCallback(() => {
    // We only clear the stream if it's the first generation as otherwise the
    // UI is in an non-obvious state for the user
    if (abortCurrentStream() && messages.length <= 1) {
      // Only clear chat if stream was actually aborted
      clearChat()
    }
  }, [abortCurrentStream, clearChat, messages.length])

  // Get tool content map
  const toolContentMap = useToolContentMap(messages)

  // Start chat on first render
  useEffect(() => {
    if (!runOnce.current) {
      runOnce.current = true
      start()
    }
  }, [start])

  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      {/* Header */}
      <div className='flex flex-row items-center justify-between w-full'>
        <Text.H6M>Prompt</Text.H6M>
        <Actions
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      </div>

      {/* Messages container */}
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar scrollable-indicator pb-12'
      >
        {/* Prompt messages */}
        <MessageList
          messages={messages.slice(0, chainLength - 1) ?? []}
          parameters={Object.keys(parameters)}
          collapseParameters={!expandParameters}
          agentToolsMap={agentToolsMap}
          toolContentMap={toolContentMap}
        />

        {/* Chain result */}
        {(messages.length ?? 0) >= chainLength && (
          <>
            <MessageList
              messages={messages.slice(chainLength - 1, chainLength) ?? []}
              toolContentMap={toolContentMap}
            />
            {time && <Timer timeMs={time} />}
          </>
        )}

        {/* Chat messages */}
        {(messages.length ?? 0) > chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList
              messages={messages.slice(chainLength)}
              toolContentMap={toolContentMap}
            />
          </>
        )}

        {/* Error or streaming response */}
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

      {/* Chat input */}
      <div className='flex relative flex-row w-full items-center justify-center'>
        <StatusIndicator
          isScrolledToBottom={isScrolledToBottom}
          usage={usage}
          runningLatitudeTools={runningLatitudeTools}
          isStreaming={isLoading}
          stopStreaming={stopStreaming}
          canStopStreaming={hasActiveStream() && isLoading}
        />
        <ChatTextArea
          clearChat={clearChat}
          placeholder='Enter followup message...'
          onSubmit={submitUserMessage}
          toolRequests={unresponedToolCalls}
          addMessages={addMessages}
          disabled={isLoading || !!error}
          disableReset={isLoading}
        />
      </div>
    </div>
  )
}
