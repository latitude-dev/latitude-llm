'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { destroyFolder } from '@latitude-data/core/services/documents/destroyFolder'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const destroyFolderAction = withProject
  .inputSchema(
    withProjectSchema.extend({ path: z.string(), commitUuid: z.string() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
      })
      .then((r) => r.unwrap())
    const result = await destroyFolder({
      path: parsedInput.path,
      commit,
      workspace: ctx.workspace,
    })
    return result.unwrap()
  })
