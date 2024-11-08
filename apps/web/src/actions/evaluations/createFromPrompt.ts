'use server'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import { createAdvancedEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const createEvaluationFromPromptAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      prompt: z.string(),
      resultType: z.nativeEnum(EvaluationResultableType),
      metadata: z
        .object({
          minValue: z.number(),
          maxValue: z.number(),
          minValueDescription: z.string().optional(),
          maxValueDescription: z.string().optional(),
        })
        .optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createAdvancedEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: 'AI-generated evaluation',
      resultType:
        input.resultType === EvaluationResultableType.Number
          ? EvaluationResultableType.Number
          : EvaluationResultableType.Boolean,
      resultConfiguration:
        input.resultType === EvaluationResultableType.Number && input.metadata
          ? input.metadata
          : {},
      metadata: {
        prompt: input.prompt,
      },
      user: ctx.user,
      projectId: ctx.project.id,
      documentUuid: ctx.document.documentUuid,
    })

    return result.unwrap()
  })
