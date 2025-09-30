'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { renameDocumentPaths } from '@latitude-data/core/services/documents/renameDocumentPaths'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const renameDocumentPathsAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      commitUuid: z.string(),
      oldPath: z.string(),
      newPath: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
      })
      .then((r) => r.unwrap())

    const result = await renameDocumentPaths({
      commit,
      oldPath: parsedInput.oldPath,
      newPath: parsedInput.newPath,
    })

    return result.unwrap()
  })
