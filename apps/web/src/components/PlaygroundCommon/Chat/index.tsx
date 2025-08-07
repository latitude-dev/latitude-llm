import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

import {
  AddMessagesFn,
  RunPromptFn,
  usePlaygroundChat,
} from '$/hooks/playgroundChat/usePlaygroundChat'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Actions, { ActionsState } from '../Actions'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { AgentToolsMap } from '@latitude-data/constants'
import {
  ChatTextArea,
  ErrorMessage,
  MessageList,
} from '$/components/ChatWrapper'

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
  const parameterKeys = useMemo(
    () => Object.keys(parameters ?? {}),
    [parameters],
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
        <Header
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      ) : null}

      <Messages
        playground={playground}
        containerRef={containerRef}
        parameterKeys={parameterKeys}
        expandParameters={expandParameters}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />

      <ChatInputBox
        canChat={canChat}
        clearChat={clearChat}
        hasActiveStream={hasActiveStream}
        isScrolledToBottom={isScrolledToBottom}
        playground={playground}
        stopStreaming={stopStreaming}
      />
    </div>
  )
}

function Header({ expandParameters, setExpandParameters }: ActionsState) {
  return (
    <div className='flex flex-row items-center justify-between w-full pb-3'>
      <Text.H6M>Prompt</Text.H6M>
      <Actions
        expandParameters={expandParameters}
        setExpandParameters={setExpandParameters}
      />
    </div>
  )
}

function Messages({
  playground,
  containerRef,
  parameterKeys,
  expandParameters,
  agentToolsMap,
  toolContentMap,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  containerRef: React.RefObject<HTMLDivElement>
  parameterKeys: string[]
  expandParameters: boolean
  agentToolsMap: AgentToolsMap
  toolContentMap: ReturnType<typeof useToolContentMap>
}) {
  return (
    <div
      ref={containerRef}
      className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 custom-scrollbar scrollable-indicator pb-12'
    >
      <MessageList
        messages={playground.messages}
        parameters={parameterKeys}
        collapseParameters={!expandParameters}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />

      {playground.error && <ErrorMessage error={playground.error} />}
    </div>
  )
}

function ChatInputBox({
  canChat,
  clearChat,
  hasActiveStream,
  isScrolledToBottom,
  playground,
  stopStreaming,
}: {
  canChat: boolean
  clearChat: () => void
  hasActiveStream: () => boolean
  isScrolledToBottom: boolean
  playground: ReturnType<typeof usePlaygroundChat>
  stopStreaming: () => void
}) {
  return (
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
        minRows={5}
        canChat={canChat}
        clearChat={clearChat}
        placeholder='Enter follow up message...'
        onSubmit={playground.submitUserMessage}
        disabled={playground.isLoading || !!playground.error}
        disableReset={playground.isLoading}
      />
    </div>
  )
}
