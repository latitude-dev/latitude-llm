import { PlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import Chat from '../../../documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { useRef } from 'react'
import { ChatInputBox } from '../../../documents/[documentUuid]/_components/DocumentEditor/Editor/ChatInputBox'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'

import { ChatSectionHeader } from './Header'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

export function AgentChatSection({
  activeTrigger,
  playground,
  parameters,
  hasActiveStream,
  onClose,
}: {
  activeTrigger?: DocumentTrigger
  playground: PlaygroundChat
  parameters: Record<string, unknown>
  hasActiveStream: () => boolean
  onClose: () => void
}) {
  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  const ref = useRef<HTMLDivElement | null>(null)

  useAutoScroll(ref, { startAtBottom: true })

  return (
    <div
      className='flex flex-col w-full h-full custom-scrollbar items-center'
      ref={ref}
    >
      <ChatSectionHeader
        activeTrigger={activeTrigger}
        onClose={onClose}
        debugMode={debugMode}
        setDebugMode={setDebugMode}
      />
      <div className='flex-1 flex flex-col w-full flex-grow min-h-0 justify-between max-w-[800px]'>
        <div className='flex-1 pt-8 pb-20'>
          <Chat
            showHeader={false}
            playground={playground}
            parameters={parameters}
            debugMode={debugMode}
            setDebugMode={setDebugMode}
          />
        </div>
        <div className='sticky bottom-0 w-full bg-background pb-4'>
          <ChatInputBox
            resetChat={playground.reset}
            hasActiveStream={hasActiveStream}
            playground={playground}
            placeholder='Ask anything'
            onBack={playground.reset}
            onBackLabel='Back to triggers'
          />
        </div>
      </div>
    </div>
  )
}
