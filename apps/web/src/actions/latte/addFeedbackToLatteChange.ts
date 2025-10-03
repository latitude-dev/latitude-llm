'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { addFeedbackToEvaluationResult } from '@latitude-data/core/services/copilot/latte/threads/addFeedbackToEvaluation'

export const addFeedbackToLatteChangeAction = authProcedure
  .inputSchema(
    z.object({
      evaluationResultUuid: z.string(),
      content: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { evaluationResultUuid, content } = parsedInput

    await addFeedbackToEvaluationResult({
      evaluationResultUuid,
      content,
    })

    return
  })
