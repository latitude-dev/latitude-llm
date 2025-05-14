'use server'

import { z } from 'zod'
import { withCommit } from '../../procedures'
import { createCopilotChatJob } from '@latitude-data/core/services/copilot/index'

export const createNewCopilotChatAction = withCommit
  .createServerAction()
  .input(
    z.object({
      message: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace, project, commit } = ctx
    const { message } = input

    const runResult = await createCopilotChatJob({
      workspace,
      project,
      commit,
      message,
    })

    return runResult.unwrap()
  })
