'use server'
import { createEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/create'
import { returnValidationErrors } from 'next-safe-action'
import { z } from 'zod'
import {
  EvaluationOptionsSchema,
  EvaluationSettingsSchema,
} from '@latitude-data/core/constants'
import { withDocument, withDocumentSchema } from '../procedures'

const evaluationSchema = withDocumentSchema.extend({
  settings: EvaluationSettingsSchema,
  options: EvaluationOptionsSchema.partial().optional(),
  issueId: z.number().nullable().optional(),
})
export const createEvaluationV2Action = withDocument
  .inputSchema(evaluationSchema)
  .action(async ({ ctx, parsedInput }) => {
    const result = await createEvaluationV2({
      document: ctx.document,
      commit: ctx.commit,
      settings: parsedInput.settings,
      options: parsedInput.options,
      issueId: parsedInput.issueId ?? null,
      workspace: ctx.workspace,
    })

    const error = result.error
    if (error && error instanceof z.ZodError) {
      return returnValidationErrors(evaluationSchema, error.format())
    }

    return result.unwrap()
  })
