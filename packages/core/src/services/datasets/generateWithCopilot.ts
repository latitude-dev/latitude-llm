import { env } from '@latitude-data/env'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { database } from '../../client'
import { getCopilot } from '../copilot/get'
import { runCopilot } from '../copilot/run'
import { z } from 'zod'
import { CLOUD_MESSAGES } from '../../constants'

const generatedDatasetResponseSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  explanation: z.string(),
})

export async function generateDatasetWithCopilot(
  {
    parameters,
    description,
    prompt,
    rowCount,
  }: {
    parameters: string
    description?: string
    prompt?: string
    rowCount: number
  },
  db = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new BadRequestError(CLOUD_MESSAGES.generateDatasets))
  }

  if (!env.COPILOT_PROJECT_ID) {
    return Result.error(new BadRequestError('COPILOT_PROJECT_ID is not set'))
  }
  if (!env.COPILOT_PROMPT_DATASET_GENERATOR_PATH) {
    return Result.error(
      new BadRequestError('COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set'),
    )
  }
  if (!env.COPILOT_WORKSPACE_API_KEY) {
    return Result.error(
      new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set'),
    )
  }

  const copilotResult = await getCopilot(
    {
      path: env.COPILOT_PROMPT_DATASET_GENERATOR_PATH,
    },
    db,
  )

  if (!Result.isOk(copilotResult)) {
    return copilotResult
  }

  const copilot = copilotResult.unwrap()
  return await runCopilot({
    copilot: copilot,
    parameters: {
      row_count: rowCount,
      parameters: parameters,
      user_message: description,
      prompt: prompt,
    },
    schema: generatedDatasetResponseSchema,
  })
}
