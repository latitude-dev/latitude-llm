'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { clearLatteThreadCheckpoints } from '@latitude-data/core/services/copilot/latte/threads/checkpoints/clearCheckpoints'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

export const acceptLatteChangesAction = authProcedure
  .inputSchema(
    z.object({
      threadUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { threadUuid } = parsedInput

    const checkpoints = await clearLatteThreadCheckpoints({
      threadUuid,
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())

    const rezult = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: true,
    })

    const uuid = rezult.value?.uuid

    return { evaluationUuid: uuid, checkpoints }
  })
