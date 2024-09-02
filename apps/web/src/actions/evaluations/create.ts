'use server'

import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      prompt: z.string().optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: input.description,
      prompt: input.prompt ?? '',
    })

    return result.unwrap()
  })
