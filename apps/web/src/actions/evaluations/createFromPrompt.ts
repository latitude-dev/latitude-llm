'use server'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const createEvaluationFromPromptAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      objective: z.string(),
      additionalInstructions: z.string().optional(),
      resultType: z.nativeEnum(EvaluationResultableType),
      metadata: z.union([
        z.object({
          minValue: z.number(),
          maxValue: z.number(),
          minValueDescription: z.string().optional(),
          maxValueDescription: z.string().optional(),
        }),
        z.object({
          falseValueDescription: z.string().optional(),
          trueValueDescription: z.string().optional(),
        }),
      ]),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: 'AI-generated evaluation',
      resultType:
        input.resultType === EvaluationResultableType.Number
          ? EvaluationResultableType.Number
          : EvaluationResultableType.Boolean,
      resultConfiguration: input.metadata,
      metadata: {
        objective: input.objective,
        additionalInstructions: input.additionalInstructions ?? null,
      },
      metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
      user: ctx.user,
      projectId: ctx.project.id,
      documentUuid: ctx.document.documentUuid,
    })

    return result.unwrap()
  })
