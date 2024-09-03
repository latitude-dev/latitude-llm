'use server'

import { EvaluationMetadataType } from '@latitude-data/core/browser'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      type: z
        .nativeEnum(EvaluationMetadataType)
        .optional()
        .default(EvaluationMetadataType.LlmAsJudge),
      metadata: z
        .object({
          prompt: z.string(),
        })
        .optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: input.description,
      metadata: input.metadata,
      type: input.type,
    })

    return result.unwrap()
  })
