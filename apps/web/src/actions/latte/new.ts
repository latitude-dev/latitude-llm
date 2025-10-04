'use server'

import { createLatteJob } from '@latitude-data/core/services/copilot/latte/createLatteJob'
import { createLatteThread } from '@latitude-data/core/services/copilot/latte/threads/createThread'
import { z } from 'zod'
import { withProject, withRateLimit } from '../procedures'

export const createNewLatteAction = (
  await withRateLimit(withProject, {
    limit: 10,
    period: 60,
  })
)
  .createServerAction()
  .input(
    z.object({
      message: z.string(),
      context: z.string(),
      debugVersionUuid: z.string().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace, user, project } = ctx
    const { message, context, debugVersionUuid } = input
    const thread = await createLatteThread({
      user,
      workspace,
      project,
    }).then((r) => r.unwrap())

    const runResult = await createLatteJob({
      threadUuid: thread.uuid,
      workspace,
      project,
      user,
      message,
      context,
      debugVersionUuid,
    })

    runResult.unwrap()

    return { uuid: thread.uuid, jobId: runResult.value }
  })
