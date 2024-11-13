'use server'

import {
  EvaluationMetadataType,
  resultConfigurationSchema,
} from '@latitude-data/core/browser'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

const advancedEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.LlmAsJudgeAdvanced),
  prompt: z.string(),
})
const simpleEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.LlmAsJudgeSimple),
  providerApiKeyId: z.number().optional(),
  model: z.string().optional(),
  objective: z.string(),
  additionalInstructions: z.string(),
})
const defaultEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.Manual),
})

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      resultConfiguration: resultConfigurationSchema,
      metadata: z.discriminatedUnion('type', [
        advancedEvaluationMetadataSchema,
        simpleEvaluationMetadataSchema,
        defaultEvaluationMetadataSchema,
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
      metadataType: input.metadata.type,
      metadata: input.metadata,
      resultType: input.resultConfiguration.type,
      resultConfiguration: input.resultConfiguration,
    })

    return result.unwrap()
  })
