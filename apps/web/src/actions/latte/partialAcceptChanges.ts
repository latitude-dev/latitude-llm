'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { partialAcceptLatteChanges } from '@latitude-data/core/services/copilot/latte/threads/checkpoints/partialAcceptChanges'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

export const partialAcceptLatteChangesAction = authProcedure
  .inputSchema(
    z.object({
      threadUuid: z.string(),
      documentUuidsToAccept: z.array(z.string()),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { threadUuid, documentUuidsToAccept } = parsedInput

    const checkpoints = await partialAcceptLatteChanges({
      workspace,
      threadUuid,
      documentUuidsToAccept,
    }).then((r) => r.unwrap())

    // Evaluate the remaining changes (if any)
    const result = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: true, // Mark as accepted since we're accepting specific changes
    })

    const evaluationUuid = result.value?.uuid

    return { evaluationUuid, checkpoints }
  })
