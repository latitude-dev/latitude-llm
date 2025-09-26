'use server'

import {
  EvaluationOptionsSchema,
  EvaluationSettingsSchema,
} from '@latitude-data/core/browser'
import { updateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/update'
import { withEvaluation, withEvaluationSchema } from '../procedures'

export const updateEvaluationV2Action = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      settings: EvaluationSettingsSchema.omit({ type: true, metric: true })
        .partial()
        .optional(),
      options: EvaluationOptionsSchema.partial().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      settings: parsedInput.settings,
      options: parsedInput.options,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
