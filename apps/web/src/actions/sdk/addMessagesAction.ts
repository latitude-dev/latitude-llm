'use server'

import { LogSources } from '@latitude-data/core/browser'
import {
  LatitudeSdk,
  type ChainEvent,
  type Message,
  type StreamChainResponse,
} from '@latitude-data/sdk-js'
import { getLatitudeApiKey } from '$/app/(private)/_data-access/latitudeApiKey'
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
  const result = await getLatitudeApiKey()
  if (result.error) return result

  const stream = createStreamableValue<ChainEvent, Error>()

  const latitudeApiKey = result.value.token
  const sdk = new LatitudeSdk({ latitudeApiKey })
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
