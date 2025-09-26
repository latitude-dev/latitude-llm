'use server'

import {
  EvaluationOptionsSchema,
  EvaluationSettingsSchema,
} from '@latitude-data/core/browser'
import { createEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/create'
import { withDocument, withDocumentSchema } from '../procedures'

export const createEvaluationV2Action = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      settings: EvaluationSettingsSchema,
      options: EvaluationOptionsSchema.partial().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await createEvaluationV2({
      document: ctx.document,
      commit: ctx.commit,
      settings: parsedInput.settings,
      options: parsedInput.options,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
