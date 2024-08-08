'use server'

import { LatitudeSdk } from '@latitude-data/sdk-js'
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

  const stream = createStreamableValue()
  const latitudeApiKey = result.value.token

  const sdk = new LatitudeSdk({ latitudeApiKey, projectId })
  await sdk.runDocument({
    params: { commitUuid, documentPath },
    onMessage: (message) => {
      stream.update({
        event: message.event,
        data: message.data,
      })
    },
    onError: (error) => {
      stream.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    },
  })

  return {
    output: stream.value,
  }
}
