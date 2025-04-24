import { useMemo } from 'react'

import { AssistantMessage, Message, MessageRole } from '@latitude-data/compiler'
import {
  ProviderLogDto,
  SERIALIZED_DOCUMENT_LOG_FIELDS,
} from '@latitude-data/core/browser'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'

const EVALUATION_PARAMETERS = SERIALIZED_DOCUMENT_LOG_FIELDS

export function EvaluationResultMessages({
  providerLog,
}: {
  providerLog?: ProviderLogDto
}) {
  const messages = useMemo<Message[]>(() => {
    if (!providerLog) return [] as Message[]

    const responseMessage = {
      role: MessageRole.assistant,
      content: providerLog.response,
      toolCalls: providerLog.toolCalls,
    } as AssistantMessage

    return [...(providerLog.messages as Message[]), responseMessage]
  }, [providerLog])

  const sourceMapAvailable = useMemo(() => {
    return messages.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [providerLog?.documentLogUuid, messages])

  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  if (!providerLog) {
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
        parameters={EVALUATION_PARAMETERS}
        collapseParameters={!expandParameters}
      />
    </>
  )
}
