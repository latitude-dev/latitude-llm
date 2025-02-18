'use server'

import { DocumentSuggestionWithDetails } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { generateDocumentSuggestion } from '@latitude-data/core/services/documentSuggestions/generate'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const generateDocumentSuggestionAction = withDocument
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const repository = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await repository
      .find(input.evaluationId)
      .then((r) => r.unwrap())

    const result = await generateDocumentSuggestion({
      workspace: ctx.workspace,
      document: ctx.document,
      evaluation: evaluation,
    }).then((r) => r.unwrap())

    return {
      suggestion: {
        ...result.suggestion,
        evaluationUuid: evaluation.uuid,
        evaluationName: evaluation.name,
      } as DocumentSuggestionWithDetails,
    }
  })
