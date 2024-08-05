'use server'

import { CommitsRepository, createNewDocument } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      path: z.string(),
      commitId: z.number(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: input.path,
    })

    return result.unwrap()
  })
