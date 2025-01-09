import { useMemo } from 'react'

import { Message } from '@latitude-data/compiler'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import {
  AppLocalStorage,
  MessageList,
  SwitchToogle,
  Text,
  useLocalStorage,
} from '@latitude-data/web-ui'

export function DocumentLogMessages({
  documentLog,
  messages,
}: {
  documentLog: DocumentLogWithMetadataAndError
  messages: Message[]
}) {
  const sourceMapAvailable = useMemo(() => {
    return messages.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [documentLog.uuid, messages])

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  if (!messages.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no messages generated for this log
      </Text.H5>
    )
  }

  return (
    <>
      <div className='flex flex-row items-center justify-between w-full sticky top-0 bg-background pb-2'>
        <Text.H6M>Messages</Text.H6M>
        {sourceMapAvailable && (
          <div className='flex flex-row gap-2 items-center'>
            <Text.H6M>Expand parameters</Text.H6M>
            <SwitchToogle
              checked={expandParameters}
              onCheckedChange={setExpandParameters}
            />
          </div>
        )}
      </div>
      <MessageList
        messages={messages}
        parameters={Object.keys(documentLog.parameters)}
        collapseParameters={!expandParameters}
      />
    </>
  )
}
