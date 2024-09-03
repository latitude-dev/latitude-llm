'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      path: z.string(),
      commitUuid: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({ uuid: input.commitUuid, project: ctx.project })
      .then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: input.path,
    })

    return result.unwrap()
  })
