import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ChatTextArea } from './ChatTextArea'

export function ChatInputBox({
  onBack,
  resetChat,
  hasActiveStream,
  playground,
  stopStreaming,
}: {
  onBack?: () => void
  resetChat: () => void
  hasActiveStream: () => boolean
  playground: ReturnType<typeof usePlaygroundChat>
  stopStreaming: () => void
}) {
  return (
    <div className='flex relative flex-row w-full items-center justify-center px-4'>
      <StatusIndicator
        playground={playground}
        resetChat={resetChat}
        stopStreaming={stopStreaming}
        canStopStreaming={hasActiveStream() && playground.isLoading}
        streamAborted={!hasActiveStream() && !playground.isLoading}
      />
      <ChatTextArea
        minRows={5}
        placeholder='Ask anything'
        onSubmit={playground.submitUserMessage}
        onBack={onBack}
        disabledSubmit={
          playground.isLoading || !!playground.error || !hasActiveStream()
        }
        disabledBack={playground.isLoading}
      />
    </div>
  )
}
