'use server'

import { createDatasetFromLogs } from '@latitude-data/core/services/datasetsV2/createFromLogs'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createDatasetFromLogsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string().min(1, { message: 'Name is required' }),
      documentLogIds: z.array(z.union([z.number(), z.string()])),
    }),
  )
  .handler(async ({ input, ctx }) => {
    return await createDatasetFromLogs({
      workspace: ctx.workspace,
      author: ctx.user,
      data: {
        name: input.name,
        documentLogIds: input.documentLogIds.map((id) => Number(id)),
      },
    }).then((r) => r.unwrap())
  })
