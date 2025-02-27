'use server'

import {
  CommitsRepository,
  DocumentSuggestionsRepository,
} from '@latitude-data/core/repositories'
import { applyDocumentSuggestion } from '@latitude-data/core/services/documentSuggestions/apply'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const applyDocumentSuggestionAction = withDocument
  .createServerAction()
  .input(
    z.object({
      suggestionId: z.number(),
      prompt: z.string().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const suggestionsRepository = new DocumentSuggestionsRepository(
      ctx.workspace.id,
    )
    const suggestion = await suggestionsRepository
      .find(input.suggestionId)
      .then((r) => r.unwrap())

    const commitsRepository = new CommitsRepository(ctx.workspace.id)
    const commit = await commitsRepository
      .getCommitByUuid({
        projectId: ctx.project.id,
        uuid: ctx.currentCommitUuid,
      })
      .then((r) => r.unwrap())

    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      commit: commit,
      prompt: input.prompt,
      workspace: ctx.workspace,
      project: ctx.project,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return result
  })
