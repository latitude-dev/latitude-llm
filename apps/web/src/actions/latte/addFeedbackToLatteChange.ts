'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { addFeedbackToEvaluationResult } from '@latitude-data/core/services/copilot/latte/threads/addFeedbackToEvaluation'

export const addFeedbackToLatteChangeAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      evaluationResultUuid: z.string(),
      content: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const { evaluationResultUuid, content } = input

    await addFeedbackToEvaluationResult({
      evaluationResultUuid,
      content,
    })

    return
  })
