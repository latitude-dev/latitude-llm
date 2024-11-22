'use server'

import {
  EvaluationMetadataType,
  resultConfigurationSchema,
} from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { updateEvaluation } from '@latitude-data/core/services/evaluations/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateEvaluationContentAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      metadata: z
        .discriminatedUnion('type', [
          z.object({
            type: z.literal(EvaluationMetadataType.LlmAsJudgeAdvanced),
            prompt: z.string(),
            promptlVersion: z.number(),
          }),
          z.object({
            type: z.literal(EvaluationMetadataType.LlmAsJudgeSimple),
            providerApiKeyId: z.number().optional(),
            model: z.string().optional(),
            objective: z.string().optional(),
            additionalInstructions: z.string().optional(),
          }),
        ])
        .optional(),
      configuration: resultConfigurationSchema.optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const { id, metadata, configuration } = input
    const scope = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await scope.find(id).then((r) => r.unwrap())

    const result = await updateEvaluation({
      evaluation,
      metadata,
      configuration,
    })

    return result.unwrap()
  })
