'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { clearLatteThreadCheckpoints } from '@latitude-data/core/services/copilot/latte/threads/checkpoints/clearCheckpoints'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

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

    const evaluationResult = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: true,
    })

    const { result } = evaluationResult.unwrap()

    return {
      evaluationUuid: result.uuid,
    }
  })
