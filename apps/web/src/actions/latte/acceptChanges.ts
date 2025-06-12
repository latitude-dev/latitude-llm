'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { clearLatteThreadCheckpoints } from '@latitude-data/core/services/copilot/index'

export const acceptLatteChangesAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      threadUuid: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { threadUuid } = input

    await clearLatteThreadCheckpoints({
      threadUuid,
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())
    return
  })
