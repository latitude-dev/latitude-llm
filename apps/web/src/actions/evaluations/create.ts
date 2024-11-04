'use server'

import {
  EvaluationMetadataType,
  resultConfigurationSchema,
} from '@latitude-data/core/browser'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      resultConfiguration: resultConfigurationSchema,
      metadataType: z.nativeEnum(EvaluationMetadataType),
      metadata: z.union([
        z.object({
          // EvaluationMetadataType.LlmAsJudgeAdvanced
          prompt: z.string(),
        }),
        z.object({
          // EvaluationMetadataType.LlmAsJudgeSimple
          providerApiKeyId: z.number(),
          model: z.string(),
          objective: z.string(),
          additionalInstructions: z.string(),
        }),
      ]),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createEvaluation({
      workspace: ctx.workspace,
      user: ctx.user,
      name: input.name,
      description: input.description,
      metadataType: input.metadataType,
      metadata: input.metadata,
      resultType: input.resultConfiguration.type,
      resultConfiguration: input.resultConfiguration,
    })

    return result.unwrap()
  })
