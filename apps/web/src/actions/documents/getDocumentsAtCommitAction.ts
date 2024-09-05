'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../procedures'

export const getDocumentsAtCommitAction = withProject
  .createServerAction()
  .input(z.object({ commitUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const commit = await new CommitsRepository(ctx.project.workspaceId)
      .getCommitByUuid({ uuid: input.commitUuid, project: ctx.project })
      .then((r) => r.unwrap())
    const docsScope = new DocumentVersionsRepository(ctx.project.workspaceId)
    const result = await docsScope.getDocumentsAtCommit(commit)

    return result.unwrap()
  })
