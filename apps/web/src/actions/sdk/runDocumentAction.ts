'use server'

import { LatitudeSdk, type ChainEvent } from '@latitude-data/sdk-js'
import { getLatitudeApiKey } from '$/app/(private)/_data-access/latitudeApiKey'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type RunDocumentActionProps = {
  documentPath: string
  projectId: number
  commitUuid: string
}
type RunDocumentResponse = Promise<{ output: StreamableValue }>
export type RunDocumentActionFn = (
  _: RunDocumentActionProps,
) => RunDocumentResponse

export async function runDocumentAction({
  documentPath,
  projectId,
  commitUuid,
}: RunDocumentActionProps) {
  const result = await getLatitudeApiKey()
  if (result.error) return result

  const stream = createStreamableValue<ChainEvent, Error>()

  const runSdk = async () => {
    const sdk = new LatitudeSdk({
      latitudeApiKey: result.value.token,
      projectId,
    })
    await sdk.runDocument({
      params: { commitUuid, documentPath },
      onMessage: (message) => stream.update(message),
      onError: (error) => {
        stream.error({
          name: error.name,
          message: error.message,
          stack: error.stack,
        })
      },
      onFinished: () => stream.done(),
    })
  }

  runSdk()

  return {
    output: stream.value,
  }
}
