'use server'

import { DocumentSuggestionsRepository } from '@latitude-data/core/repositories'
import { discardDocumentSuggestion } from '@latitude-data/core/services/documentSuggestions/discard'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const discardDocumentSuggestionAction = withDocument
  .inputSchema(withDocumentSchema.extend({ suggestionId: z.number() }))
  .action(async ({ ctx, parsedInput }) => {
    const repository = new DocumentSuggestionsRepository(ctx.workspace.id)
    const suggestion = await repository
      .find(parsedInput.suggestionId)
      .then((r) => r.unwrap())

    const result = await discardDocumentSuggestion({
      suggestion: suggestion,
      workspace: ctx.workspace,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
