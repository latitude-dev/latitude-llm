'use server'

import { DocumentSuggestionsRepository } from '@latitude-data/core/repositories'
import { applyDocumentSuggestion } from '@latitude-data/core/services/documentSuggestions/apply'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const applyDocumentSuggestionAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      suggestionId: z.number(),
      prompt: z.string().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const suggestionsRepository = new DocumentSuggestionsRepository(
      ctx.workspace.id,
    )
    const suggestion = await suggestionsRepository
      .find(parsedInput.suggestionId)
      .then((r) => r.unwrap())

    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      commit: ctx.commit,
      prompt: parsedInput.prompt,
      workspace: ctx.workspace,
      project: ctx.project,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
