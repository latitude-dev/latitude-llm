import { env } from '@latitude-data/env'
import { User } from '../../schema/models/types/User'
import { Workspace } from '../../schema/models/types/Workspace'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { createDatasetFromJson } from './createFromJson'
import { database } from '../../client'
import { getCopilot } from '../copilot/get'
import { runCopilot } from '../copilot/run'
import { z } from 'zod'

const generatedDatasetResponseSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  explanation: z.string(),
})

export async function generateDatasetWithCopilot(
  {
    workspace,
    user,
    parameters,
    description,
    prompt,
    rowCount,
    name,
  }: {
    workspace: Workspace
    user: User
    parameters: string
    description?: string
    prompt?: string
    rowCount: number
    name: string
  },
  db = database,
) {
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
    throw copilotResult
  }

  const copilot = copilotResult.unwrap()
  const generatedDatasetResult = await runCopilot({
    copilot: copilot,
    parameters: {
      row_count: rowCount,
      parameters: parameters,
      user_message: description,
      prompt: prompt,
    },
    schema: generatedDatasetResponseSchema,
  })

  if (!Result.isOk(generatedDatasetResult)) {
    throw generatedDatasetResult
  }

  const generatedDataset = generatedDatasetResult.unwrap()
  return await createDatasetFromJson({
    author: user,
    workspace,
    data: {
      name,
      rows: JSON.stringify(generatedDataset.rows),
    },
  })
}
