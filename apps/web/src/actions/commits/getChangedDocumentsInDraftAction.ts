'use server'

import { CommitsRepository } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const getChangedDocumentsInDraftAction = withProject
  .createServerAction()
  .input(z.object({ id: z.number() }))
  .handler(async ({ input, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    return commitScope.getChanges(input.id).then((r) => r.unwrap())
  })
