'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { createLatteJob } from '@latitude-data/core/services/copilot/latte/createLatteJob'
import { createLatteThread } from '@latitude-data/core/services/copilot/latte/threads/createThread'

export const createNewLatteAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      message: z.string(),
      context: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace, user } = ctx
    const { message, context } = input

    const thread = await createLatteThread({
      user,
      workspace,
    }).then((r) => r.unwrap())

    const runResult = await createLatteJob({
      threadUuid: thread.uuid,
      workspace,
      user,
      message,
      context,
    })

    runResult.unwrap()

    return { uuid: thread.uuid }
  })
