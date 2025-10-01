'use server'
import { BadRequestError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { generatePreviewRowsFromJson } from '@latitude-data/core/services/datasetRows/generatePreviewRowsFromJson'
import { authProcedure } from '$/actions/procedures'
import { z } from 'zod'
import { CLOUD_MESSAGES, LogSources } from '@latitude-data/core/constants'

export const generateDatasetPreviewAction = authProcedure
  .inputSchema(
    z.object({
      description: z.string(),
      parameters: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
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
    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
      __internal: { source: LogSources.Playground },
    }).then((r) => r.unwrap())
    const result = await sdk.prompts.run<{
      rows: string
      explanation: string
    }>(env.COPILOT_PROMPT_DATASET_GENERATOR_PATH, {
      stream: false,
      parameters: {
        row_count: 10,
        parameters: parsedInput.parameters,
        user_message: parsedInput.description,
      },
    })
    if (!result) {
      throw new BadRequestError(
        'Something went wrong generating the CSV preview',
      )
    }

    const response = result.response

    if (response.streamType !== 'object') {
      throw new BadRequestError(
        'Generated AI response for CSV preview is not valid',
      )
    }

    const parseResult = generatePreviewRowsFromJson({
      rows: response.object.rows,
    })
    const { headers, rows } = parseResult.unwrap()

    const explanation = response.object.explanation as string
    return {
      headers,
      rows,
      explanation,
    }
  })
