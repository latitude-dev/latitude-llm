'use server'

import { LogSources } from '@latitude-data/core/browser'
import {
  type ChainEvent,
  type Message,
  type StreamChainResponse,
} from '@latitude-data/sdk-js'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type AddMessagesActionProps = {
  documentLogUuid: string
  messages: Message[]
}
type AddMessagesResponse = Promise<{
  output: StreamableValue<ChainEvent>
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
  const stream = createStreamableValue<ChainEvent, Error>()

  const response = sdk.addMessges({
    params: { documentLogUuid, messages, source: LogSources.Playground },
    onMessage: (chainEvent) => {
      stream.update(chainEvent)
    },
    onError: (error) => {
      stream.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    },
    onFinished: () => stream.done(),
  })
  return {
    output: stream.value,
    response,
  }
}
