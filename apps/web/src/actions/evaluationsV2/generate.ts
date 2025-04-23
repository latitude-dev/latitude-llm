'use server'

import { generateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/generate'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const generateEvaluationV2Action = withDocument
  .createServerAction()
  .input(
    z.object({
      instructions: z.string().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await generateEvaluationV2({
      instructions: input.instructions,
      document: ctx.document,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
