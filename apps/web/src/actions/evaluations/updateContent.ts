'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { updateAdvancedEvaluationPrompt } from '@latitude-data/core/services/evaluations/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateEvaluationContentAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      metadata: z.object({
        prompt: z.string(),
      }),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const scope = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await scope.find(input.id).then((r) => r.unwrap())

    const result = await updateAdvancedEvaluationPrompt({
      evaluation,
      prompt: input.metadata.prompt,
    })

    return result.unwrap()
  })
