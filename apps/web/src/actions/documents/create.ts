'use server'

import { CommitsRepository, createNewDocument } from '@latitude-data/core'
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
    const commit = await new CommitsRepository(ctx.project.workspaceId)
      .getCommitByUuid({ uuid: input.commitUuid, project: ctx.project })
      .then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: input.path,
    })

    return result.unwrap()
  })
