'use server'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import { createAdvancedEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      configuration: z.object({
        type: z.nativeEnum(EvaluationResultableType),
        detail: z
          .object({ range: z.object({ from: z.number(), to: z.number() }) })
          .optional(),
      }),
      metadata: z
        .object({
          prompt: z.string(),
        })
        .optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createAdvancedEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: input.description,
      metadata: input.metadata ?? { prompt: '' },
      configuration: input.configuration,
      user: ctx.user,
    })

    return result.unwrap()
  })
