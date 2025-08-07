'use server'

import { UnauthorizedError } from '@latitude-data/constants/errors'
import { EvaluationResultableType } from '@latitude-data/core/browser'
import { createEvaluationTemplate } from '@latitude-data/core/services/evaluationAdvancedTemplates/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationTemplateAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      categoryId: z.number().optional().default(1),
      categoryName: z.string().optional(),
      configuration: z.object({
        type: z.nativeEnum(EvaluationResultableType),
        detail: z
          .object({ range: z.object({ from: z.number(), to: z.number() }) })
          .optional(),
      }),
      prompt: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    // TODO: move this check to a procedure
    if (!ctx.user.admin)
      throw new UnauthorizedError(
        'You must be an admin to create an evaluation template',
      )

    const {
      name,
      description,
      categoryId,
      categoryName,
      configuration,
      prompt,
    } = input

    return await createEvaluationTemplate({
      name,
      description,
      categoryId,
      categoryName,
      configuration,
      prompt,
    }).then((r) => r.unwrap())
  })
