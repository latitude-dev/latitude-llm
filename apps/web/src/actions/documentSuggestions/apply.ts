'use server'

import { DocumentSuggestionsRepository } from '@latitude-data/core/repositories'
import { applyDocumentSuggestion } from '@latitude-data/core/services/documentSuggestions/apply'
import { z } from 'zod'
import { withProject } from '../procedures'

export const applyDocumentSuggestionAction = withProject
  .createServerAction()
  .input(
    z.object({
      suggestionId: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const repository = new DocumentSuggestionsRepository(ctx.workspace.id)
    const suggestion = await repository
      .find(input.suggestionId)
      .then((r) => r.unwrap())

    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      workspace: ctx.workspace,
      project: ctx.project,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
