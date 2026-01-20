import { env } from '@latitude-data/env'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { database } from '../../client'
import { runCopilot } from '../copilot/run'
import { z } from 'zod'
import { CLOUD_MESSAGES } from '../../constants'
import { assertCopilotIsSupported } from '../copilot/assertItsSupported'

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
  const assertResult = assertCopilotIsSupported(CLOUD_MESSAGES.generateDatasets)
  if (!Result.isOk(assertResult)) {
    return assertResult
  }

  if (!env.COPILOT_PROMPT_DATASET_GENERATOR_PATH) {
    return Result.error(
      new BadRequestError('COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set'),
    )
  }

  return await runCopilot({
    path: env.COPILOT_PROMPT_DATASET_GENERATOR_PATH,
    parameters: {
      row_count: rowCount,
      parameters: parameters,
      user_message: description,
      prompt: prompt,
    },
    schema: generatedDatasetResponseSchema,
    db,
  })
}
