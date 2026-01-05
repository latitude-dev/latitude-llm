import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { memo } from 'react'
import { ChatTextArea } from './ChatTextArea'

export const ChatInputBox = memo(function ChatInputBox({
  onBack,
  onBackLabel,
  resetChat,
  hasActiveStream,
  playground,
  placeholder = 'Ask anything',
}: {
  onBack?: () => void
  onBackLabel?: string
  placeholder?: string
  resetChat: () => void
  hasActiveStream: () => boolean
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  return (
    <div className='relative w-full'>
      <StatusIndicator
        playground={playground}
        resetChat={resetChat}
        stopStreaming={playground.stop}
        canStopStreaming={hasActiveStream() && playground.canStop}
        streamAborted={!hasActiveStream() && !playground.isLoading}
      />
      <ChatTextArea
        minRows={5}
        placeholder={placeholder}
        onSubmit={playground.submitUserMessage}
        onBack={onBack}
        onBackLabel={onBackLabel}
        disabledSubmit={
          playground.isLoading ||
          playground.isStopping ||
          !!playground.error ||
          !hasActiveStream()
        }
        disabledBack={playground.isLoading}
      />
    </div>
  )
})
