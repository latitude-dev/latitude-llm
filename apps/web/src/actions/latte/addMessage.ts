'use server'

import { NotFoundError } from '@latitude-data/constants/errors'
import { LatteThreadsRepository } from '@latitude-data/core/repositories'
import { createLatteJob } from '@latitude-data/core/services/copilot/latte/createLatteJob'
import { z } from 'zod'
import { withProject, withProjectSchema, withRateLimit } from '../procedures'

export const addMessageToLatteAction = withProject
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    withProjectSchema.extend({
      threadUuid: z.string(),
      message: z.string(),
      context: z.string(),
      debugVersionUuid: z.string().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace, user } = ctx
    const { message, threadUuid, context, debugVersionUuid } = parsedInput
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
      project: ctx.project,
      user,
      threadUuid: thread.uuid,
      message,
      context,
      debugVersionUuid,
    })

    runResult.unwrap()

    return { uuid: thread.uuid, jobId: runResult.value }
  })
