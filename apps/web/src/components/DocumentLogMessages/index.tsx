import { MessageList } from '$/components/ChatWrapper'
import DebugToggle from '$/components/DebugToggle'
import { Message } from '@latitude-data/constants/messages'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { useMemo } from 'react'

export function DocumentLogMessages({
  documentLogParameters,
  messages,
}: {
  documentLogParameters: Record<string, unknown>
  messages: Message[]
}) {
  const toolContentMap = useToolContentMap(messages)
  const sourceMapAvailable = useMemo(() => {
    return messages.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [messages])

  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  if (!messages.length) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          There are no messages generated for this log
        </Text.H5>
      </div>
    )
  }

  return (
    <>
      <div className='flex flex-row items-center justify-between w-full sticky top-0 bg-background pb-2'>
        <Text.H6M>Messages</Text.H6M>
        {sourceMapAvailable && (
          <div className='flex flex-row gap-2 items-center'>
            <DebugToggle enabled={debugMode} setEnabled={setDebugMode} />
          </div>
        )}
      </div>
      <MessageList
        messages={messages}
        parameters={Object.keys(documentLogParameters)}
        debugMode={debugMode}
        toolContentMap={toolContentMap}
      />
    </>
  )
}
