'use server'

import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { env } from '@latitude-data/env'
import { ChainEventDto } from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { createStreamableValue } from 'ai/rsc'

type RunDocumentActionProps = {
  projectId: number
  documentUuid: string
  parameters: Record<string, unknown>
  description: string
}

export async function generateDatasetPreviewAction({
  parameters,
  description,
}: RunDocumentActionProps) {
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()
  if (!env.DATASET_GENERATOR_PROJECT_ID) {
    throw new BadRequestError('DATASET_GENERATOR_PROJECT_ID is not set')
  }
  if (!env.DATASET_GENERATOR_DOCUMENT_PATH) {
    throw new BadRequestError('DATASET_GENERATOR_DOCUMENT_PATH is not set')
  }
  if (!env.DATASET_GENERATOR_WORKSPACE_APIKEY) {
    throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
  }

  const { workspace } = await getCurrentUserOrError()
  const sdk = await createSdk({
    workspace,
    apiKey: env.DATASET_GENERATOR_WORKSPACE_APIKEY,
    projectId: env.DATASET_GENERATOR_PROJECT_ID,
    __internal: { source: LogSources.Playground },
  }).then((r) => r.unwrap())
  const response = await sdk.run(env.DATASET_GENERATOR_DOCUMENT_PATH, {
    parameters: {
      row_count: 10,
      parameters,
      user_message: description,
    },
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
