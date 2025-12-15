'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { undoLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/checkpoints/undoChanges'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

export const discardLatteChangesActions = authProcedure
  .inputSchema(
    z.object({
      threadUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { threadUuid } = parsedInput

    const checkpoints = await undoLatteThreadChanges({
      workspace,
      threadUuid,
    }).then((r) => r.unwrap())

    const rezult = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: false,
    })

    const uuid = rezult.value?.uuid

    return { evaluationUuid: uuid, checkpoints }
  })
