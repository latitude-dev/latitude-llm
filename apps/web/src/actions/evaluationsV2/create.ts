'use server'

import {
  EvaluationOptionsSchema,
  EvaluationSettingsSchema,
} from '@latitude-data/core/browser'
import { createEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/create'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const createEvaluationV2Action = withDocument
  .createServerAction()
  .input(
    z.object({
      settings: EvaluationSettingsSchema,
      options: EvaluationOptionsSchema.partial().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await createEvaluationV2({
      document: ctx.document,
      commit: ctx.commit,
      settings: input.settings,
      options: input.options,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
