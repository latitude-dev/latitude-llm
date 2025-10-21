import useFeature from '$/stores/useFeature'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import React, { useEffect, useMemo, useRef } from 'react'

import {
  ChatTextArea,
  ErrorMessage,
  MessageList,
} from '$/components/ChatWrapper'
import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import {
  AddMessagesFn,
  RunPromptFn,
  usePlaygroundChat,
} from '$/hooks/playgroundChat/usePlaygroundChat'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Actions, { ActionsState } from '../Actions'

export default function Chat({
  canChat,
  parameters,
  clearChat,
  runPromptFn,
  abortCurrentStream,
  hasActiveStream,
  isRunStream: isRunStreamProp = true,
  addMessagesFn,
  onPromptRan,
  debugMode,
  setDebugMode,
  showHeader,
}: {
  canChat: boolean
  parameters: Record<string, unknown> | undefined
  clearChat: () => void
  runPromptFn: RunPromptFn
  abortCurrentStream: () => boolean
  hasActiveStream: () => boolean
  isRunStream?: boolean
  showHeader: boolean
  onPromptRan?: (documentLogUuid?: string, error?: Error) => void
  addMessagesFn?: AddMessagesFn
} & ActionsState) {
  const runOnce = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  useAutoScroll(containerRef, { startAtBottom: true })
  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn,
    onPromptRan,
  })

  const { isEnabled: isRunsEnabled } = useFeature('runs')
  const isRunStream = isRunsEnabled && isRunStreamProp

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
    <div className='flex flex-col flex-1 h-full overflow-y-auto'>
      {showHeader && (
        <Header debugMode={debugMode} setDebugMode={setDebugMode} />
      )}
      <Messages
        playground={playground}
        containerRef={containerRef}
        parameterKeys={parameterKeys}
        debugMode={debugMode}
        toolContentMap={toolContentMap}
      />
      <div className='w-full pb-4 z-[11] flex items-center justify-center'>
        <ChatInputBox
          canChat={canChat}
          clearChat={clearChat}
          abortCurrentStream={abortCurrentStream}
          hasActiveStream={hasActiveStream}
          isRunStream={isRunStream}
          playground={playground}
        />
      </div>
    </div>
  )
}

function Header({ debugMode, setDebugMode }: ActionsState) {
  return (
    <div className='flex flex-row items-center justify-between w-full pb-3'>
      <Text.H6M>Prompt</Text.H6M>
      <Actions debugMode={debugMode} setDebugMode={setDebugMode} />
    </div>
  )
}

function Messages({
  playground,
  containerRef,
  parameterKeys,
  debugMode,
  toolContentMap,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  containerRef: React.RefObject<HTMLDivElement | null>
  parameterKeys: string[]
  debugMode: boolean
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
        debugMode={debugMode}
        toolContentMap={toolContentMap}
      />

      {playground.error && <ErrorMessage error={playground.error} />}
    </div>
  )
}

function ChatInputBox({
  canChat,
  clearChat,
  abortCurrentStream,
  hasActiveStream,
  isRunStream,
  playground,
}: {
  canChat: boolean
  clearChat: () => void
  abortCurrentStream: () => boolean
  hasActiveStream: () => boolean
  isRunStream: boolean
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  return (
    <div className='flex relative flex-row w-full items-center justify-center px-4'>
      <StatusIndicator
        playground={playground}
        resetChat={clearChat}
        stopStreaming={isRunStream ? playground.stop : abortCurrentStream}
        canStopStreaming={hasActiveStream() && playground.canStop}
        streamAborted={!hasActiveStream() && !playground.isLoading}
        canChat={canChat}
      />
      <ChatTextArea
        minRows={5}
        canChat={canChat}
        placeholder='Ask anything'
        onSubmit={playground.submitUserMessage}
        onClear={clearChat}
        disabledSubmit={
          playground.isLoading ||
          playground.isStopping ||
          !!playground.error ||
          !hasActiveStream()
        }
        disabledClear={playground.isLoading}
      />
    </div>
  )
}
