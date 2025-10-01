'use server'
import { createEvaluationTemplate } from '@latitude-data/core/services/evaluationAdvancedTemplates/create'
import { z } from 'zod'

import { EvaluationResultableType } from '@latitude-data/core/constants'
import { withAdmin } from '../procedures'

export const createEvaluationTemplateAction = withAdmin
  .inputSchema(
    z.object({
      name: z.string(),
      description: z.string(),
      categoryId: z.number().optional().default(1),
      categoryName: z.string().optional(),
      configuration: z.object({
        type: z.enum(EvaluationResultableType),
        detail: z
          .object({ range: z.object({ from: z.number(), to: z.number() }) })
          .optional(),
      }),
      prompt: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const {
      name,
      description,
      categoryId,
      categoryName,
      configuration,
      prompt,
    } = parsedInput

    return await createEvaluationTemplate({
      name,
      description,
      categoryId,
      categoryName,
      configuration,
      prompt,
    }).then((r) => r.unwrap())
  })
