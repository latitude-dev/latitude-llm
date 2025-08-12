'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { deleteCommitDraft } from '@latitude-data/core/services/commits/delete'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const deleteDraftCommitAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      id: z.number(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(parsedInput.id)
      .then((r) => r.unwrap())

    return deleteCommitDraft(commit).then((r) => r.unwrap())
  })
