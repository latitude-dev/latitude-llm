'use server'

import { z } from 'zod'
import { BadRequestError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { authProcedure } from '$/actions/procedures'
import { createDatasetFromJson } from '@latitude-data/core/services/datasets/createFromJson'
import {
  ChainStepResponse,
  CLOUD_MESSAGES,
  LogSources,
} from '@latitude-data/core/constants'

export const generateDatasetAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      parameters: z.string(),
      description: z.string(),
      rowCount: z.number(),
      name: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    if (!env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.generateDatasets)
    }
    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }
    if (!env.COPILOT_PROMPT_DATASET_GENERATOR_PATH) {
      throw new BadRequestError(
        'COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set',
      )
    }
    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
    }

    const { user, workspace } = await getCurrentUserOrRedirect()
    const sdk = await createSdk({
      workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
      __internal: { source: LogSources.Playground },
    }).then((r) => r.unwrap())

    const sdkResponse = await sdk.prompts.run<{}>(
      env.COPILOT_PROMPT_DATASET_GENERATOR_PATH,
      {
        stream: false,
        parameters: {
          row_count: input.rowCount,
          parameters: input.parameters,
          user_message: input.description,
        },
      },
    )
    const sdkResult = sdkResponse

    if (!sdkResult) {
      throw new BadRequestError(
        'Something went wrong generating the Dataset preview',
      )
    }

    const response = sdkResult.response as ChainStepResponse<'object'>
    const name = input.name
    const result = await createDatasetFromJson({
      author: user,
      workspace,
      data: {
        name,
        rows: response.object.rows,
      },
    })

    if (result.error) {
      throw result.error
    }

    return result.value
  })
