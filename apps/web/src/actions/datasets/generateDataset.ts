'use server'

import {
  ChainStepResponse,
  Dataset,
  LogSources,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { createDataset } from '@latitude-data/core/services/datasets/create'
import { env } from '@latitude-data/env'
import { ChainEventDto } from '@latitude-data/sdk'
import slugify from '@sindresorhus/slugify'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { createStreamableValue } from 'ai/rsc'

type GenerateDatasetActionProps = {
  parameters: Record<string, unknown>
  description: string
  rowCount: number
  name: string
}

export async function generateDatasetAction({
  parameters,
  description,
  rowCount,
  name,
}: GenerateDatasetActionProps) {
  if (!env.DATASET_GENERATOR_PROJECT_ID) {
    throw new BadRequestError('DATASET_GENERATOR_PROJECT_ID is not set')
  }
  if (!env.DATASET_GENERATOR_DOCUMENT_PATH) {
    throw new BadRequestError('DATASET_GENERATOR_DOCUMENT_PATH is not set')
  }
  if (!env.DATASET_GENERATOR_WORKSPACE_APIKEY) {
    throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
  }

  let response: Dataset | undefined
  const { user, workspace } = await getCurrentUser()
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()
  const sdk = await createSdk({
    apiKey: env.DATASET_GENERATOR_WORKSPACE_APIKEY,
    projectId: env.DATASET_GENERATOR_PROJECT_ID,
    __internal: { source: LogSources.Playground },
  }).then((r) => r.unwrap())
  const sdkResponse = await sdk.run(env.DATASET_GENERATOR_DOCUMENT_PATH, {
    parameters: {
      row_count: rowCount,
      parameters,
      user_message: description,
    },
    onError: (error) => {
      stream.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    },
  })

  try {
    const sdkResult = sdkResponse
    const csv = (sdkResult?.response! as ChainStepResponse<'object'>).object.csv
    const result = await createDataset({
      author: user,
      workspace,
      data: {
        name,
        file: new File([csv], `${slugify(name)}.csv`, { type: 'text/csv' }),
        csvDelimiter: ',',
      },
    })
    if (result.error) {
      stream.error({
        name: result.error.name,
        message: result.error.message,
        stack: result.error.stack,
      })
    } else {
      response = result.value
      stream.done()
    }
  } catch (error) {
    try {
      stream.error({
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      })
    } catch (error) {
      // do nothing, stream ight be already closed
    }
  }

  return {
    output: stream.value,
    response,
  }
}
