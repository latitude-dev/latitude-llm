import { StatusIndicator } from '$/components/PlaygroundCommon/StatusIndicator'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { memo } from 'react'
import { ChatTextArea } from './ChatTextArea'

export const ChatInputBox = memo(function ChatInputBox({
  onBack,
  onBackLabel,
  resetChat,
  abortCurrentStream,
  hasActiveStream,
  isRunStream,
  playground,
  placeholder = 'Ask anything',
}: {
  onBack?: () => void
  onBackLabel?: string
  placeholder?: string
  resetChat: () => void
  abortCurrentStream: () => void
  hasActiveStream: () => boolean
  isRunStream: boolean
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  return (
    <div className='flex relative flex-row w-full items-center justify-center px-4'>
      <StatusIndicator
        playground={playground}
        resetChat={resetChat}
        stopStreaming={isRunStream ? playground.stop : abortCurrentStream}
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
