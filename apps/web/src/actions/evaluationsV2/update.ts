'use server'

import { updateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/update'
import { z } from 'zod'
import { returnValidationErrors } from 'next-safe-action'
import { EvaluationSettingsSchema } from '@latitude-data/core/constants'
import { withEvaluation, withEvaluationSchema } from '../procedures'

const evaluationSchema = withEvaluationSchema.extend({
  settings: EvaluationSettingsSchema.omit({ type: true, metric: true })
    .partial()
    .optional(),
  issueId: z.number().nullable().optional(),
})

export const updateEvaluationV2Action = withEvaluation
  .inputSchema(evaluationSchema)
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      settings: parsedInput.settings,
      issueId: parsedInput.issueId,
      workspace: ctx.workspace,
    })

    const error = result.error

    if (error && error instanceof z.ZodError) {
      return returnValidationErrors(evaluationSchema, error.format())
    }

    return result.unwrap()
  })
