import { memo, useMemo } from 'react'
import { ErrorMessage, MessageList } from '$/components/ChatWrapper'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Actions, { ActionsState } from './Actions'

export default function PromptPlaygroundChat({
  debugMode,
  parameters,
  playground,
  setDebugMode,
  showHeader,
}: {
  parameters: Record<string, unknown> | undefined
  playground: ReturnType<typeof usePlaygroundChat>
  showHeader: boolean
} & ActionsState) {
  const toolContentMap = useToolContentMap(playground.messages)
  const parameterKeys = useMemo(
    () => Object.keys(parameters ?? {}),
    [parameters],
  )

  return (
    <div className='w-full flex flex-col flex-1'>
      {showHeader && (
        <Header debugMode={debugMode} setDebugMode={setDebugMode} />
      )}

      <Messages
        messages={playground.messages}
        error={playground.error}
        parameterKeys={parameterKeys}
        debugMode={debugMode ?? false}
        toolContentMap={toolContentMap}
        isStreaming={playground.isLoading}
      />
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

const Messages = memo(function Messages({
  messages,
  error,
  parameterKeys,
  debugMode,
  toolContentMap,
  isStreaming,
}: {
  messages: ReturnType<typeof usePlaygroundChat>['messages']
  error: ReturnType<typeof usePlaygroundChat>['error']
  parameterKeys: string[]
  debugMode: boolean
  toolContentMap: ReturnType<typeof useToolContentMap>
  isStreaming: boolean
}) {
  return (
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0'>
      <MessageList
        messages={messages}
        parameters={parameterKeys}
        debugMode={debugMode}
        toolContentMap={toolContentMap}
        isStreaming={isStreaming}
      />

      {error && <ErrorMessage error={error} />}
    </div>
  )
})
