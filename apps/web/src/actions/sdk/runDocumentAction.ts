'use server'

import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import { Latitude, type ChainEventDto } from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { createStreamableValue, StreamableValue } from 'ai/rsc'
import { ChainEvent } from '@latitude-data/constants'

type RunDocumentActionProps = {
  documentPath: string
  projectId: number
  commitUuid: string
  parameters: Record<string, unknown>
}
export type RunDocumentResponse = Promise<{
  output: StreamableValue<ChainEvent>
  response: ReturnType<typeof Latitude.prototype.prompts.run>
}>
export type RunDocumentActionFn = (
  _: RunDocumentActionProps,
) => RunDocumentResponse

export async function runDocumentAction({
  documentPath,
  projectId,
  commitUuid,
  parameters,
}: RunDocumentActionProps) {
  const { workspace, user } = await getCurrentUserOrError()

  publisher.publishLater({
    type: 'documentRunRequested',
    data: {
      projectId,
      commitUuid,
      documentPath,
      parameters,
      workspaceId: workspace.id,
      userEmail: user.email,
    },
  })

  const sdk = await createSdk({
    workspace,
    projectId,
    __internal: { source: LogSources.Playground },
  }).then((r) => r.unwrap())
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()
  const response = sdk.prompts.run(documentPath, {
    stream: true,
    versionUuid: commitUuid,
    parameters,
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
