'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { partialRejectLatteChanges } from '@latitude-data/core/services/copilot/latte/threads/checkpoints/partialRejectChanges'
import { evaluateLatteThreadChanges } from '@latitude-data/core/services/copilot/latte/threads/evaluateChanges'

export const partialRejectLatteChangesAction = authProcedure
  .inputSchema(
    z.object({
      threadUuid: z.string(),
      documentUuidsToReject: z.array(z.string()),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const { threadUuid, documentUuidsToReject } = parsedInput

    const checkpoints = await partialRejectLatteChanges({
      workspace,
      threadUuid,
      documentUuidsToReject,
    }).then((r) => r.unwrap())

    // Evaluate the remaining changes (if any)
    const result = await evaluateLatteThreadChanges({
      threadUuid,
      accepted: false, // Mark as rejected since we're rejecting specific changes
    })

    const evaluationUuid = result.value?.uuid

    return { evaluationUuid, checkpoints }
  })
