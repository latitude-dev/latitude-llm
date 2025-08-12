'use server'

import { z } from 'zod'
import { createLatteJob } from '@latitude-data/core/services/copilot/latte/createLatteJob'
import { createLatteThread } from '@latitude-data/core/services/copilot/latte/threads/createThread'
import { withProject, withProjectSchema, withRateLimit } from '../procedures'

export const createNewLatteAction = withProject
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    withProjectSchema.extend({
      message: z.string(),
      context: z.string(),
      debugVersionUuid: z.string().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace, user, project } = ctx
    const { message, context, debugVersionUuid } = parsedInput
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
