'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { undoLatteThreadChanges } from '@latitude-data/core/services/copilot/index'

export const discardLatteChangesActions = authProcedure
  .createServerAction()
  .input(
    z.object({
      threadUuid: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const { threadUuid } = input

    await undoLatteThreadChanges({
      workspaceId: workspace.id,
      threadUuid,
    }).then((r) => r.unwrap())

    return
  })
