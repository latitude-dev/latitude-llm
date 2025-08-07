'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { getCommitChanges } from '@latitude-data/core/services/commits/getChanges'
import { withProject } from '../procedures'

export const getChangedDocumentsInDraftAction = withProject
  .createServerAction()
  .input(z.object({ id: z.number() }))
  .handler(async ({ input, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(input.id)
      .then((r) => r.unwrap())

    return getCommitChanges({ commit, workspace: ctx.workspace }).then((r) =>
      r.unwrap(),
    )
  })
