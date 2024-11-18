'use server'

import { EvaluationResultsRepository } from '@latitude-data/core/repositories'
import { updateEvaluationResult } from '@latitude-data/core/services/evaluationResults/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateEvaluationResultAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      value: z.union([z.boolean(), z.number(), z.string()]),
      reason: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const evaluationResultsScope = new EvaluationResultsRepository(
      ctx.workspace.id,
    )
    const evaluationResult = await evaluationResultsScope
      .find(input.id)
      .then((r) => r.unwrap())

    const result = await updateEvaluationResult({
      evaluationResult,
      result: {
        result: input.value,
        reason: input.reason,
      },
    })

    return result.unwrap()
  })
