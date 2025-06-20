'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { undoLatteThreadChanges } from '@latitude-data/core/services/copilot/index'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

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
      workspace,
      threadUuid,
    }).then((r) => r.unwrap())

    const evaluationResult = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: false,
    })

    if (!evaluationResult.ok) {
      return { evaluationUuid: undefined }
    }

    const { result } = evaluationResult.unwrap()

    return {
      evaluationUuid: result.uuid,
    }
  })
