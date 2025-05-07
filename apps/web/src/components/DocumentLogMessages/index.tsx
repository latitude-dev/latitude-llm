import { useMemo } from 'react'

import { Message } from '@latitude-data/compiler'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'

export function DocumentLogMessages({
  documentLogParameters,
  messages,
}: {
  documentLogParameters: Record<string, unknown>
  messages: Message[]
}) {
  const sourceMapAvailable = useMemo(() => {
    return messages.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [messages])

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
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
            <Text.H6M>Expand parameters</Text.H6M>
            <SwitchToggle
              checked={expandParameters}
              onCheckedChange={setExpandParameters}
            />
          </div>
        )}
      </div>
      <MessageList
        messages={messages}
        parameters={Object.keys(documentLogParameters)}
        collapseParameters={!expandParameters}
      />
    </>
  )
}
