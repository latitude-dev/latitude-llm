'use server'

import { LatitudeSdk, type ChainEvent } from '@latitude-data/sdk-js'
import { getLatitudeApiKey } from '$/app/(private)/_data-access/latitudeApiKey'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type RunDocumentActionProps = {
  documentPath: string
  projectId: number
  commitUuid: string
  parameters: Record<string, unknown>
}
type RunDocumentResponse = Promise<{ output: StreamableValue<ChainEvent> }>
export type RunDocumentActionFn = (
  _: RunDocumentActionProps,
) => RunDocumentResponse

export async function runDocumentAction({
  documentPath,
  projectId,
  commitUuid,
  parameters,
}: RunDocumentActionProps) {
  const result = await getLatitudeApiKey()
  if (result.error) return result

  const stream = createStreamableValue<ChainEvent, Error>()

  const sdk = new LatitudeSdk({
    latitudeApiKey: result.value.token,
    projectId,
  })
  sdk.runDocument({
    params: { commitUuid, documentPath, parameters },
    onMessage: (message) => {
      stream.update(message)
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
  }
}
