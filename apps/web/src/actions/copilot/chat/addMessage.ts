'use server'

import { z } from 'zod'
import { withCommit } from '$/actions/procedures'
import { createCopilotChatJob } from '@latitude-data/core/services/copilot/index'

export const addMessageToCopilotChatAction = withCommit
  .createServerAction()
  .input(
    z.object({
      chatUuid: z.string(),
      message: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace, project, commit } = ctx
    const { message, chatUuid } = input

    const runResult = await createCopilotChatJob({
      workspace,
      project,
      commit,
      message,
      chatUuid,
    })

    return runResult.unwrap()
  })
