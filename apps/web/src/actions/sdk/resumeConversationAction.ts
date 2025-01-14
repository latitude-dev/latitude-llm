'use server'

import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import {
  type ChainEventDto,
  type StreamChainResponse,
  type ToolCallResponse,
} from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type Props = {
  versionUuid: string
  conversationUuid: string
  toolCallResponses: ToolCallResponse[]
}
type ResumeConversationResponse = Promise<{
  output: StreamableValue<{ event: StreamEventTypes; data: ChainEventDto }>
  response: Promise<StreamChainResponse | undefined>
}>
export type AddMessagesActionFn = (_: Props) => ResumeConversationResponse

export async function resumeConversationAction({
  versionUuid,
  conversationUuid,
  toolCallResponses,
}: Props) {
  const { workspace } = await getCurrentUserOrError()

  const sdk = await createSdk({
    workspace,
    __internal: { source: LogSources.Playground },
  }).then((r) => r.unwrap())
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()

  const response = sdk.prompts.resumeConversation(
    {
      versionUuid,
      conversationUuid,
      toolCallResponses,
    },
    {
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
    },
  )

  return {
    output: stream.value,
    response,
  }
}
