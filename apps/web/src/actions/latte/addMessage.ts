'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { LatteThreadsRepository } from '@latitude-data/core/repositories'
import { createLatteJob } from '@latitude-data/core/services/copilot/latte/addMessage'
import { NotFoundError } from '@latitude-data/constants/errors'

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
    const { workspace, user } = ctx
    const { message, threadUuid, context } = input

    const threadScope = new LatteThreadsRepository(workspace.id)
    const thread = await threadScope.findByUuidAndUser({
      threadUuid,
      userId: user.id,
    })
    if (!thread) {
      throw new NotFoundError('Latte thread not found')
    }

    const runResult = await createLatteJob({
      workspace,
      user,
      threadUuid: thread.uuid,
      message,
      context,
    })

    runResult.unwrap()

    return { uuid: thread.uuid }
  })
