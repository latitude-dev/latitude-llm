'use server'

import { LogSources } from '@latitude-data/core/browser'
import {
  type ChainEvent,
  type StreamChainResponse,
} from '@latitude-data/sdk-js'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type RunDocumentActionProps = {
  documentPath: string
  projectId: number
  commitUuid: string
  parameters: Record<string, unknown>
}
type RunDocumentResponse = Promise<{
  output: StreamableValue<ChainEvent>
  response: Promise<StreamChainResponse | undefined>
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
  const sdk = await createSdk().then((r) => r.unwrap())
  const stream = createStreamableValue<ChainEvent, Error>()
  const response = sdk.runDocument({
    params: {
      projectId,
      commitUuid,
      documentPath,
      parameters,
      source: LogSources.Playground,
    },
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
