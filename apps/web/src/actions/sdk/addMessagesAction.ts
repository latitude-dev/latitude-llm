'use server'

import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import {
  type ChainEventDto,
  type Message,
  type StreamChainResponse,
} from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
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
  const { workspace, user } = await getCurrentUserOrError()

  publisher.publishLater({
    type: 'chatMessageRequested',
    data: {
      documentLogUuid,
      messages,
      workspaceId: workspace.id,
      userEmail: user.email,
    },
  })

  const sdk = await createSdk({
    workspace,
    __internal: { source: LogSources.Playground },
  }).then((r) => r.unwrap())
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()

  const response = sdk.chat(documentLogUuid, messages, {
    stream: true,
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
