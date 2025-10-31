'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { generateDatasetWithCopilot } from '@latitude-data/core/services/datasets/generateWithCopilot'

export const generateDatasetAction = authProcedure
  .inputSchema(
    z.object({
      parameters: z.string(),
      description: z.string().optional(),
      rowCount: z.number(),
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { parameters, description, rowCount, name } = parsedInput

    return await generateDatasetWithCopilot({
      workspace: ctx.workspace,
      user: ctx.user,
      parameters,
      description,
      rowCount,
      name,
    }).then((r) => r.unwrap())
  })
