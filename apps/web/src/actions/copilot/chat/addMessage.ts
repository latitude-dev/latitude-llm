'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { createCopilotChatJob } from '@latitude-data/core/services/copilot/index'
import { latteContextSchema } from './schema'

export const addMessageToCopilotChatAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      chatUuid: z.string(),
      message: z.string(),
      context: latteContextSchema,
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { message, chatUuid, context } = input

    const runResult = await createCopilotChatJob({
      workspace,
      chatUuid,
      message,
      context,
    })

    return runResult.unwrap()
  })
