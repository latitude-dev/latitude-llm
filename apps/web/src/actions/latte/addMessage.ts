'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { createLatteJob } from '@latitude-data/core/services/copilot/latte/createJob'

export const addMessageToLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      threadUuid: z.string(),
      message: z.string(),
      context: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { message, threadUuid, context } = input

    const runResult = await createLatteJob({
      workspace,
      threadUuid,
      message,
      context,
    })

    runResult.unwrap()

    return { uuid: threadUuid }
  })
