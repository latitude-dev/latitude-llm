'use server'

import { StreamEventTypes } from '@latitude-data/core/browser'
import {
  type ChainEventDto,
  type Message,
  type StreamChainResponse,
} from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type AddMessagesActionProps = {
  documentLogUuid: string
  messages: Message[]
}
type AddMessagesResponse = Promise<{
  output: StreamableValue<{ event: StreamEventTypes; data: ChainEventDto }>
  response: Promise<StreamChainResponse | undefined>
}>
export type AddMessagesActionFn = (
  _: AddMessagesActionProps,
) => AddMessagesResponse

export async function addMessagesAction({
  documentLogUuid,
  messages,
}: AddMessagesActionProps) {
  const sdk = await createSdk().then((r) => r.unwrap())
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()

  const response = sdk.chat(documentLogUuid, messages, {
    onEvent: (event) => {
      stream.update(event)
    },
    onError: (error) => {
      stream.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    },
    onFinished: () => {
      stream.done()
    },
  })

  return {
    output: stream.value,
    response,
  }
}
