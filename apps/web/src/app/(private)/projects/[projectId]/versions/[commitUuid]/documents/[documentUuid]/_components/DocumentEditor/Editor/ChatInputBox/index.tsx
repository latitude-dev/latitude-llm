import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ChatTextArea } from './ChatTextArea'

export function ChatInputBox({
  canChat,
  clearChat,
  hasActiveStream,
  playground,
  stopStreaming,
}: {
  canChat: boolean
  clearChat: () => void
  hasActiveStream: () => boolean
  playground: ReturnType<typeof usePlaygroundChat>
  stopStreaming: () => void
}) {
  return (
    <div className='flex relative flex-row w-full items-center justify-center'>
      <StatusIndicator
        isScrolledToBottom={false}
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
        placeholder='Ask anything'
        onSubmit={playground.submitUserMessage}
        disabled={playground.isLoading || !!playground.error}
        disableReset={playground.isLoading}
      />
    </div>
  )
}
