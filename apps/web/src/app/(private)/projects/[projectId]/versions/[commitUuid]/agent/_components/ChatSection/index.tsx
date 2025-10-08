import { PlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import Chat from '../../../documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useRef, useState } from 'react'
import { ChatInputBox } from '../../../documents/[documentUuid]/_components/DocumentEditor/Editor/ChatInputBox'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'

export function AgentChatSection({
  playground,
  parameters,
  hasActiveStream,
  abortCurrentStream,
  onClose,
}: {
  playground: PlaygroundChat
  parameters: Record<string, unknown>
  hasActiveStream: () => boolean
  abortCurrentStream: () => void
  onClose: () => void
}) {
  const [expandedParameters, setExpandedParameters] = useState(false)

  const ref = useRef<HTMLDivElement | null>(null)

  useAutoScroll(ref, { startAtBottom: true })

  return (
    <div
      className='flex flex-col w-full h-full custom-scrollbar items-center'
      ref={ref}
    >
      <div className='sticky top-0 flex flex-row w-full items-center justify-center'>
        <Button
          variant='ghost'
          iconProps={{
            name: 'chevronUp',
          }}
          fullWidth
          onClick={onClose}
        >
          Back to agent
        </Button>
      </div>
      <div className='flex-1 flex flex-col w-full max-w-[800px] flex-grow min-h-0 justify-between'>
        <div className='flex-1 pb-20'>
          <Chat
            showHeader
            playground={playground}
            parameters={parameters}
            expandParameters={expandedParameters}
            setExpandParameters={setExpandedParameters}
          />
        </div>
        <div className='sticky bottom-0 w-full bg-background pb-4'>
          <ChatInputBox
            resetChat={playground.reset}
            hasActiveStream={hasActiveStream}
            playground={playground}
            abortCurrentStream={abortCurrentStream}
            placeholder='Ask anything'
            onBack={playground.reset}
            onBackLabel='Back to triggers'
            isRunStream={false}
          />
        </div>
      </div>
    </div>
  )
}
