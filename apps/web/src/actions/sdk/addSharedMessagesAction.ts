'use server'

import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import { type ChainEventDto, type Message } from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { createStreamableValue } from 'ai/rsc'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { AddMessagesResponse } from '$/actions/sdk/addMessagesAction'

type AddMessagesActionProps = {
  publishedDocumentUuid: string
  documentLogUuid: string
  messages: Message[]
}
export type AddMessagesActionFn = (
  _: AddMessagesActionProps,
) => AddMessagesResponse

export async function addSharedMessagesAction({
  publishedDocumentUuid,
  documentLogUuid,
  messages,
}: AddMessagesActionProps) {
  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error) {
    throw result.error
  }

  const { workspace } = result.value
  publisher.publishLater({
    type: 'sharedChatMessageRequested',
    data: {
      workspaceId: workspace.id,
      publishedDocumentUuid,
      documentLogUuid,
      messages,
    },
  })

  const sdk = await createSdk({
    workspace,
    __internal: { source: LogSources.SharedPrompt },
  }).then((r) => r.unwrap())
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()

  const response = sdk.prompts.chat(documentLogUuid, messages, {
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
