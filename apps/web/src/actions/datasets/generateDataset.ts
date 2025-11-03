'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { generateDatasetWithCopilot } from '@latitude-data/core/services/datasets/generateWithCopilot'
import { createDatasetFromJson } from '@latitude-data/core/services/datasets/createFromJson'

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

    const generatedDatasetContent = await generateDatasetWithCopilot({
      parameters,
      description,
      rowCount,
    }).then((r) => r.unwrap())

    return await createDatasetFromJson({
      author: ctx.user,
      workspace: ctx.workspace,
      data: {
        name,
        rows: JSON.stringify(generatedDatasetContent.rows),
      },
    }).then((r) => r.unwrap())
  })
