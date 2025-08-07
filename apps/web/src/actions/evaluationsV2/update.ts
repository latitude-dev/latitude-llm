'use server'

import { EvaluationOptionsSchema, EvaluationSettingsSchema } from '@latitude-data/core/browser'
import { updateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/update'
import { z } from 'zod'
import { withEvaluation } from '../procedures'

export const updateEvaluationV2Action = withEvaluation
  .createServerAction()
  .input(
    z.object({
      settings: EvaluationSettingsSchema.omit({ type: true, metric: true }).partial().optional(),
      options: EvaluationOptionsSchema.partial().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await updateEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      settings: input.settings,
      options: input.options,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
