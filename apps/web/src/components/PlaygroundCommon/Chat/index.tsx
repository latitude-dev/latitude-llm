import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ErrorMessage,
  MessageList,
} from '@latitude-data/web-ui/molecules/ChatWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { ChatTextArea } from '@latitude-data/web-ui/molecules/ChatWrapper'

import {
  AddMessagesFn,
  RunPromptFn,
  usePlaygroundChat,
} from '$/hooks/playgroundChat/usePlaygroundChat'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { useToolContentMap } from 'node_modules/@latitude-data/web-ui/src/lib/hooks/useToolContentMap'
import Actions, { ActionsState } from '../Actions'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'
import { Timer } from '$/components/PlaygroundCommon/Timer'

export default function Chat({
  canChat,
  parameters,
  clearChat,
  runPromptFn,
  abortCurrentStream,
  hasActiveStream,
  addMessagesFn,
  onPromptRan,
  expandParameters,
  setExpandParameters,
  showHeader,
}: {
  canChat: boolean
  parameters: Record<string, unknown> | undefined
  clearChat: () => void
  runPromptFn: RunPromptFn
  abortCurrentStream: () => boolean
  hasActiveStream: () => boolean
  showHeader: boolean
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
  addMessagesFn?: AddMessagesFn
} & ActionsState) {
  const runOnce = useRef(false)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: agentToolsMap } = useAgentToolsMap({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  useAutoScroll(containerRef, {
    startAtBottom: true,
    onScrollChange: setIsScrolledToBottom,
  })
  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  // Function to stop the streaming response with confirmation
  const stopStreaming = useCallback(() => {
    // We only clear the stream if it's the first generation as otherwise the
    // UI is in an non-obvious state for the user
    if (abortCurrentStream() && playground.messages.length <= 1) {
      // Only clear chat if stream was actually aborted
      clearChat()
    }
  }, [abortCurrentStream, clearChat, playground.messages.length])

  const toolContentMap = useToolContentMap(playground.messages)

  // Memoize all values that were previously in conditional hooks
  const promptMessages = useMemo(
    () => playground.messages.slice(0, playground.chainLength - 1) ?? [],
    [playground.messages, playground.chainLength],
  )

  const parameterKeys = useMemo(
    () => Object.keys(parameters ?? {}),
    [parameters],
  )

  const chainResultMessages = useMemo(
    () =>
      playground.messages.slice(
        playground.chainLength - 1,
        playground.chainLength,
      ) ?? [],
    [playground.messages, playground.chainLength],
  )

  const chatMessages = useMemo(
    () => playground.messages.slice(playground.chainLength),
    [playground.messages, playground.chainLength],
  )

  // FIXME: Do not run side effects on useEffect. Move to event handler.
  useEffect(() => {
    if (!runOnce.current) {
      runOnce.current = true
      playground.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playground.start])

  return (
    <div className='flex flex-col flex-1 h-full overflow-hidden'>
      {showHeader ? (
        <div className='flex flex-row items-center justify-between w-full pb-3'>
          <Text.H6M>Prompt</Text.H6M>
          <Actions
            expandParameters={expandParameters}
            setExpandParameters={setExpandParameters}
          />
        </div>
      ) : null}

      {/* Messages container */}
      <div
        ref={containerRef}
        className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar scrollable-indicator pb-12'
      >
        {/* Prompt messages */}
        <MessageList
          messages={promptMessages}
          parameters={parameterKeys}
          collapseParameters={!expandParameters}
          agentToolsMap={agentToolsMap}
          toolContentMap={toolContentMap}
        />

        {/* Chain result */}
        {(playground.messages.length ?? 0) >= playground.chainLength && (
          <>
            <MessageList
              messages={chainResultMessages}
              toolContentMap={toolContentMap}
            />
            {playground.time && <Timer timeMs={playground.time} />}
          </>
        )}

        {/* Chat messages */}
        {(playground.messages.length ?? 0) > playground.chainLength && (
          <>
            <Text.H6M>Chat</Text.H6M>
            <MessageList
              messages={chatMessages}
              toolContentMap={toolContentMap}
            />
          </>
        )}

        {/* Error or streaming response */}
        {playground.error ? (
          <ErrorMessage error={playground.error} />
        ) : (
          <StreamMessage
            responseStream={playground.streamingResponse}
            reasoningStream={playground.streamingReasoning}
            messages={playground.messages}
            chainLength={playground.chainLength}
          />
        )}
      </div>

      {/* Chat input */}
      <div className='flex relative flex-row w-full items-center justify-center'>
        <StatusIndicator
          isScrolledToBottom={isScrolledToBottom}
          usage={playground.usage}
          wakingUpIntegration={playground.wakingUpIntegration}
          runningLatitudeTools={playground.runningLatitudeTools}
          isStreaming={playground.isLoading}
          stopStreaming={stopStreaming}
          canStopStreaming={hasActiveStream() && playground.isLoading}
        />
        <ChatTextArea
          canChat={canChat}
          clearChat={clearChat}
          placeholder='Enter follow up message...'
          onSubmit={playground.submitUserMessage}
          toolRequests={playground.unresponedToolCalls}
          addMessages={playground.addMessages}
          disabled={playground.isLoading || !!playground.error}
          disableReset={playground.isLoading}
        />
      </div>
    </div>
  )
}
