'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { createCopilotChatJob } from '@latitude-data/core/services/copilot/index'
import { latteContextSchema } from './schema'

export const createNewCopilotChatAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      message: z.string(),
      context: latteContextSchema,
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { message, context } = input

    const runResult = await createCopilotChatJob({
      workspace,
      message,
      context,
    })

    return runResult.unwrap()
  })
