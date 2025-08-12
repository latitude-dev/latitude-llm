'use server'

import { generateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/generate'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const generateEvaluationV2Action = withDocument
  .inputSchema(
    withDocumentSchema.extend({ instructions: z.string().optional() }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await generateEvaluationV2({
      instructions: parsedInput.instructions,
      document: ctx.document,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
